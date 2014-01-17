module.exports = function(grunt) {
	var updateManifest = true;
	var isProduction = grunt.option('env') == 'production';
	var rjsOpt = {
		baseUrl: './lib',
		paths: {
			chrome: 'extension/chrome',
			webkit: 'extension/webkit',
			lodash: 'vendor/lodash',
			emSelect: 'vendor/emSelect/emSelect',
			emmet: '../node_modules/emmet',
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
						src: ['./lib/extension/*.js', './lib/extension/chrome/*.*', './out/worker.js', './out/cssom.js'], 
						dest: './out/chrome/'
					}),
					fc({
						src: ['./lib/vendor/**/*.{js,css}'], 
						dest: './out/chrome/vendor'
					}),
					fc({
						src: ['**/*.js'], 
						dest: './out/chrome/emmet',
						expand: true,
						flatten: false,
						cwd: './node_modules/emmet/lib'
					})
				]
			},
			chrome_base: {
				files: [
					fc({
						src: ['./lib/*.js'], 
						dest: './out/chrome/'
					}),
					fc({
						src: ['./lib/less/*.js'], 
						dest: './out/chrome/less/'
					})
				],
				options: {
					processContent: function(content, srcPath) {
						return content.replace(/\.\.\/node_modules\/emmet\/lib/g, 'emmet');
					}
				}
			},
			chrome_cssom: {
				files: [
					fc({
						src: ['./out/cssom.js'], 
						dest: './out/chrome'
					})
				],
				options: {
					processContent: function(content, srcPath) {
						return '(function(stylesheet, patches){var module = {};'
							+ content
							+ ';return module.exports.patch(stylesheet, patches);})(%%PARAMS%%);';
					}
				}
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
			
			webkit: {
				files: [
					fc({
						src: ['./out/worker.js', './lib/extension/webkit/*.pdf', './lib/extension/chrome/{panel.css,entypo.woff}'],
						dest: './out/webkit'
					})
				]
			},
			webkit_app: {
				files: [
					fc({
						src: ['./out/webkit/*.*'],
						dest: '/Applications/WebKit.app/Contents/Frameworks/10.8/WebInspectorUI.framework/Resources/livestyle'
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
		uglify: {
			cssom: {
				files: {'out/cssom.js': ['lib/cssom.js']}
			}
		},
		watch: {
			plugins: {
				files: './lib/**/*.*',
				tasks: ['chrome', 'notify:watch'],
				options: {
					nospawn: false,
				}
			},
			webkit: {
				files: './lib/**/*.*',
				tasks: ['webkit', 'copy:webkit_app'],
				options: {
					nospawn: false,
				}
			}
		},
		requirejs: {
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
				include: ['extension/worker']
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
			}),
			chrome_options: rjsConfig({
				out: './out/chrome-ext/options.js',
				include: ['extension/chrome/options']
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
		},
		notify: {
			watch: {
				options: {
					title:  'Emmet LiveStyle',
					message: 'Watch compile complete'
				}
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
	grunt.loadNpmTasks('grunt-contrib-uglify');

	// Default task.
	grunt.registerTask('default', ['copy:chrome']);
	grunt.registerTask('chrome', ['requirejs:worker', 'uglify:cssom', 'copy:chrome_base', 'copy:chrome', 'copy:chrome_cssom']);
	grunt.registerTask('webkit', ['clean:webkit', 'requirejs:worker', 'requirejs:webkit', 'copy:webkit', 'zip:webkit']);
	grunt.registerTask('pack-chrome', ['clean:chrome_ext', 'requirejs:worker', 'requirejs:chrome_devtools', 'requirejs:chrome_panel', 'requirejs:chrome_background', 'requirejs:chrome_options', 'copy:chrome_ext', 'crx', 'zip:chrome']);
	grunt.registerTask('readme', ['markdown:readme', 'copy:readme']);
};