module.exports = function(grunt) {
	var updateManifest = true;

	function fc(data) {
		var out = {expand: true, flatten: true};
		Object.keys(data).forEach(function(k) {
			out[k] = data[k];
		});

		return out;
	}

	function chromeReqConfig(name, optimize) {
		return {
			options: {
				baseUrl: './lib',
				paths: {
					chrome: 'extension/chrome',
					lodash: 'vendor/lodash'
				},
				out: './out/chrome-ext/' + name + '.js',
				// optimize: 'none',
				optimize: optimize || 'uglify2',
				name: 'backend/almond',
				include: ['extension/chrome/' + name],
				wrap: {
					start: '(function() {',
					end: '})();'
				}
			}
		};
	}

	function sublimeConfig(optimize, outName) {
		return {
			options: {
				baseUrl: './lib',
				paths: {
					lodash: 'vendor/lodash'
				},
				out: './out/sublimetext/' + outName,
				optimize: optimize ? 'uglify2' : 'none',
				name: 'backend/almond',
				include: ['backend/sublimetext'],
				wrap: {
					start: '(function(root, factory){root.livestyle = factory();}(this, function () {',
					end: 'return require(\'backend/sublimetext\');}));'
				}
			}
		}
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
						src: ['./lib/*.js', './lib/extension/*.js', './lib/extension/chrome/*.*'], 
						dest: './out/chrome/'
					}),
					fc({
						src: ['./lib/vendor/**/*.{js,css}'], 
						dest: './out/chrome/vendor'
					}),
					fc({
						src: ['./out/worker.js'], 
						dest: './out/chrome'
					})
				]
			},
			'chrome-ext': {
				files: [
					fc({
						src: ['./lib/extension/chrome/*.*', '!./lib/extension/chrome/*.{html,js}', '!./lib/extension/chrome/manifest.json'], 
						dest: './out/chrome-ext/'
					}),
					fc({
						src: ['./lib/vendor/emmet.js', './lib/extension/chrome/background.js'], 
						dest: './out/chrome-ext'
					})
				]
			},
			'chrome-ext-html': {
				files: [
					fc({
						src: ['./lib/extension/chrome/*.html'], 
						dest: './out/chrome-ext/'
					})
				],
				options: {
					processContent: function(content) {
						return content
							.replace(/<script src="require.js" data-main="(.+?)"><\/script>/, '<script src="$1"></script>')
							.replace(/vendor\//, '');
					}
				}
			},
			'chrome-ext-manifest': {
				files: [
					fc({
						src: ['./lib/extension/chrome/manifest.json'], 
						dest: './out/chrome-ext/'
					})
				],
				options: {
					processContent: function(content) {
						if (updateManifest) {
							var manifest = JSON.parse(content);
							var dt = new Date();
							manifest.version += '.' + (dt.getMonth() + 1) + pad(dt.getDate());
							content = JSON.stringify(manifest);
						}
						return content;
					}
				}
			},

			st: {
				files: [
					fc({
						src: ['./out/sublimetext/{livestyle,livestyle-src}.js'], 
						dest: '/Users/Sergey/Library/Application Support/Sublime Text 2/Packages/LiveStyle/'
					}),
					fc({
						src: ['./lib/vendor/emmet.js'], 
						dest: '/Users/Sergey/Library/Application Support/Sublime Text 2/Packages/LiveStyle/'
					})
				]
			},
			webkit: {
				files: [{
					src: ['./out/webkit/livestyle.js'], 
					dest: '/Applications/WebKit.app/Contents/Frameworks/10.8/WebInspector.framework/Versions/Current/Resources/livestyle.js'
				}]
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
				tasks: ['chrome', 'webkit', 'st'],
				options: {
					nospawn: true,
				}
			}
		},
		requirejs: {
			st: sublimeConfig(true, 'livestyle.js'),
			'st-src': sublimeConfig(false, 'livestyle-src.js'),
			webkit: {
				options: {
					baseUrl: './lib',
					paths: {
						webkit: 'extension/webkit',
						lodash: 'vendor/lodash',
						emSelect: 'vendor/emSelect/emSelect'
					},
					out: './out/webkit/livestyle.js',
					optimize: 'none',
					name: 'backend/almond',
					include: ['extension/webkit/livestyle'],
					wrap: {
						start: '(function(root, factory){root.livestyle = factory();}(this, function () {',
						end: 'return require(\'extension/webkit/livestyle\');}));'
					}
				}
			},

			worker: {
				options: {
					baseUrl: './lib',
					paths: {
						lodash: 'vendor/lodash'
					},
					out: './out/worker.js',
					optimize: 'none',
					name: 'backend/almond',
					include: ['vendor/emmet', 'extension/worker']
				}
			},
			'chrome-devtools': chromeReqConfig('devtools'),
			'chrome-panel': chromeReqConfig('panel'),
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
		}
	});

	grunt.loadNpmTasks('grunt-crx');
	grunt.loadNpmTasks('grunt-markdown');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-contrib-requirejs');

	// Default task.
	grunt.registerTask('default', ['copy:chrome']);
	grunt.registerTask('chrome', ['requirejs:worker', 'copy:chrome']);
	grunt.registerTask('st', ['requirejs:st', 'requirejs:st-src', 'copy:st']);
	grunt.registerTask('webkit', ['requirejs:webkit', 'copy:webkit']);
	grunt.registerTask('pack-chrome', ['requirejs:chrome-devtools', 'requirejs:chrome-panel', 'copy:chrome-ext', 'copy:chrome-ext-html', 'copy:chrome-ext-manifest', 'crx']);
	grunt.registerTask('readme', ['markdown:readme', 'copy:readme']);
};