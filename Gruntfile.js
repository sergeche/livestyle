module.exports = function(grunt) {
	var updateManifest = true;
	var isProduction = grunt.option('env') == 'production';
	var rjsOpt = {
		baseUrl: './lib',
		paths: {
			chrome: 'extension/chrome',
			webkit: 'extension/webkit',
			lodash: 'vendor/lodash',
			emSelect: 'vendor/emSelect/emSelect'
		},
		optimize: isProduction ? 'uglify2' : 'none',
		name: 'backend/almond',
	};

	function merge(obj) {
		var args = Array.prototype.slice.call(arguments, 1), c;
		while (c = args.shift()) {
			Object.keys(c).forEach(function(k) {
				obj[k] = c[k];
			});
		}
		
		return obj;
	}

	function fc(data) {
		return merge({expand: true, flatten: true}, data);
	}

	function rjsConfig(opt) {
		return {options: merge({}, rjsOpt, opt)};
	}

	function sublimeConfig(outName) {
		return rjsConfig({
			out: './out/sublimetext/' + outName,
			include: ['backend/sublimetext'],
			optimize: ~outName.indexOf('-src') ? 'none' : 'uglify2',
			wrap: {
				start: '(function(root, factory){root.livestyle = factory();}(this, function () {',
				end: 'return require(\'backend/sublimetext\');}));'
			}
		});
	}

	function pad(num) {
		return (num < 10 ? '0' : '') + num;
	}

	grunt.initConfig({
		crx: {
			livestyle: {
				src: 'out/chrome-ext',
				dest: grunt.option('crx') || 'out/livestyle.crx',
				baseURL: 'http://download.emmet.io/livestyle/chrome/',
				exclude: ['.git'],
				privateKey: grunt.option('pem') || '~/.ssh/livestyle.pem'
			}
		},
		copy: {
			chrome: {
				files: [
					fc({
						src: ['./lib/*.js', './lib/extension/*.js', './lib/extension/chrome/*.*', './out/worker.js'], 
						dest: './out/chrome/'
					}),
					fc({
						src: ['./lib/vendor/**/*.{js,css}'], 
						dest: './out/chrome/vendor'
					})
				]
			},
			chrome_ext: {
				files: [
					fc({
						src: ['./lib/extension/chrome/*.*', '!./lib/extension/chrome/*.js', './out/worker.js'], 
						dest: './out/chrome-ext'
					})
				],
				options: {
					processContent: function(content, srcPath) {
						if (/\.html$/.test(srcPath)) {
							content = content
								.replace(/<script src="require.js" data-main="(.+?)"><\/script>/, '<script src="$1"></script>')
								.replace(/vendor\//, '');
						} else if (/manifest\.json$/.test(srcPath) && updateManifest) {
							var manifest = JSON.parse(content);
							var dt = new Date();
							manifest.version += '.' + (dt.getMonth() + 1) + pad(dt.getDate());
							content = JSON.stringify(manifest);
						}

						return content;
					},
					processContentExclude: './lib/extension/chrome/*.{png,woff}'
				}
			},
			
			st: {
				files: [
					fc({
						src: ['./out/sublimetext/{livestyle,livestyle-src}.js', './lib/vendor/emmet.js'], 
						dest: '/Users/Sergey/Library/Application Support/Sublime Text 2/Packages/LiveStyle/'
					})
				]
			},
			webkit: {
				files: [
					fc({
						src: ['./out/worker.js', './lib/extension/webkit/*.pdf', './lib/extension/chrome/{panel.css,entypo.woff}'],
						dest: './out/webkit'
					})
				]
			},
			readme: {
				files: [
					fc({
						src: ['templates/*.{css,js}'], 
						dest: grunt.option('readme') || 'out/html'
					})
				]
			}

		},
		watch: {
			plugins: {
				files: './lib/**/*.*',
				tasks: ['chrome', 'webkit'],
				options: {
					nospawn: true,
				}
			}
		},
		requirejs: {
			st: sublimeConfig('livestyle.js'),
			st_src: sublimeConfig('livestyle-src.js'),
			webkit: rjsConfig({
				out: './out/webkit/livestyle.js',
				include: ['extension/webkit/livestyle'],
				wrap: {
					start: '(function(root, factory){root.livestyle = factory("./livestyle/");}(this, function (LIVESTYLE_URL) {',
					end: 'return require(\'extension/webkit/livestyle\');}));'
				}
			}),
			worker: rjsConfig({
				out: './out/worker.js',
				include: ['vendor/emmet', 'extension/worker']
			}),
			chrome_devtools: rjsConfig({
				out: './out/chrome-ext/devtools.js',
				include: ['extension/chrome/devtools']
			}),
			chrome_panel: rjsConfig({
				out: './out/chrome-ext/panel.js',
				include: ['extension/chrome/panel']
			}),
			chrome_background: rjsConfig({
				out: './out/chrome-ext/background.js',
				include: ['extension/chrome/background']
			})
		},
		markdown: {
			readme: {
				files: [{
					expand: true,
					src: 'README.md',
					dest: grunt.option('readme') || 'out/html',
					ext: '.html'
				}],
				options: {
					template: 'templates/index.html'
				}
			}
		},
		clean: {
			webkit: ['./out/webkit'],
			chrome_ext: ['./out/chrome-ext']
		},
		zip: {
			webkit: {
				cwd: './out/webkit/',
				src: ['./out/webkit/*.*'],
				dest: grunt.option('webkit-zip') || './out/livestyle-webkit.zip'
			},
			chrome: {
				cwd: './out/chrome-ext/',
				src: ['./out/chrome-ext/*.*'],
				dest: grunt.option('chrome-zip') || './out/livestyle-chrome.zip'
			}
		}
	});

	grunt.loadNpmTasks('grunt-crx');
	grunt.loadNpmTasks('grunt-zip');
	grunt.loadNpmTasks('grunt-notify');
	grunt.loadNpmTasks('grunt-markdown');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-contrib-requirejs');

	// Default task.
	grunt.registerTask('default', ['copy:chrome']);
	grunt.registerTask('chrome', ['requirejs:worker', 'copy:chrome']);
	grunt.registerTask('st', ['requirejs:st', 'requirejs:st_src', 'copy:st']);
	grunt.registerTask('webkit', ['clean:webkit', 'requirejs:worker', 'requirejs:webkit', 'copy:webkit', 'zip:webkit']);
	grunt.registerTask('pack-chrome', ['clean:chrome_ext', 'requirejs:worker', 'requirejs:chrome_devtools', 'requirejs:chrome_panel', 'requirejs:chrome_background', 'copy:chrome_ext', 'crx', 'zip:chrome']);
	grunt.registerTask('readme', ['markdown:readme', 'copy:readme']);
};