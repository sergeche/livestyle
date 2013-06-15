module.exports = function(grunt) {

	function chromeReqConfig(name) {
		return {
			options: {
				baseUrl: './lib',
				paths: {
					chrome: 'extension/chrome',
					lodash: 'vendor/lodash'
				},
				out: './out/chrome-ext/' + name + '.js',
				// optimize: 'none',
				optimize: 'uglify2',
				name: 'backend/almond',
				include: ['extension/chrome/' + name],
				wrap: {
					start: '(function() {',
					end: '})();'
				}
			}
		};
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
					{
						expand: true,
						flatten: true,
						src: ['./lib/*.js', './lib/extension/*.js', './lib/extension/chrome/*.*'], 
						dest: './out/chrome/'
					},
					{
						expand: true,
						flatten: true,
						src: ['./lib/vendor/*.js'], 
						dest: './out/chrome/vendor'
					}
				]
			},
			'chrome-ext': {
				files: [
					{
						expand: true,
						flatten: true,
						src: ['./lib/extension/chrome/*.*', '!./lib/extension/chrome/*.{html,js}'], 
						dest: './out/chrome-ext/'
					},
					{
						expand: true,
						flatten: true,
						src: ['./lib/vendor/emmet.js', './lib/extension/chrome/background.js'], 
						dest: './out/chrome-ext'
					}
				]
			},
			'chrome-ext-html': {
				files: [
					{
						expand: true,
						flatten: true,
						src: ['./lib/extension/chrome/*.html'], 
						dest: './out/chrome-ext/'
					}
				],
				options: {
					processContent: function(content) {
						return content
							.replace(/<script src="require.js" data-main="(.+?)"><\/script>/, '<script src="$1"></script>')
							.replace(/vendor\//, '');
					}
				}
			},

			st: {
				files: [
					{
						src: ['./out/sublimetext/livestyle.js'], 
						dest: '/Users/Sergey/Library/Application Support/Sublime Text 2/Packages/LiveStyle/livestyle.js'
					}
				]
			},
			webkit: {
				files: [{
					src: ['./out/webkit/livestyle.js'], 
					dest: '/Applications/WebKit.app/Contents/Frameworks/10.8/WebInspector.framework/Versions/Current/Resources/livestyle.js'
				}]
			}
		},
		watch: {
			plugins: {
				files: './lib/**/*.*',
				tasks: ['copy:chrome', 'requirejs:st', 'copy:st', 'webkit'],
				options: {
					nospawn: true,
				}
			}
		},
		requirejs: {
			st: {
				options: {
					baseUrl: './lib',
					paths: {
						lodash: 'vendor/lodash'
					},
					out: './out/sublimetext/livestyle.js',
					optimize: 'none',
					name: 'backend/almond',
					include: ['backend/sublimetext'],
					wrap: {
						start: '(function(root, factory){root.livestyle = factory();}(this, function () {',
						end: 'return require(\'backend/sublimetext\');}));'
					}
				}
			},
			webkit: {
				options: {
					baseUrl: './lib',
					paths: {
						webkit: 'extension/webkit',
						lodash: 'vendor/lodash'
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

			'chrome-devtools': chromeReqConfig('devtools'),
			'chrome-panel': chromeReqConfig('panel'),
		}
	});

	grunt.loadNpmTasks('grunt-crx');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-contrib-requirejs');

	// Default task.
	grunt.registerTask('default', ['copy:chrome']);
	grunt.registerTask('st', ['requirejs:st', 'copy:st']);
	grunt.registerTask('webkit', ['requirejs:webkit', 'copy:webkit']);
	grunt.registerTask('pack-chrome', ['requirejs:chrome-devtools', 'requirejs:chrome-panel', 'copy:chrome-ext', 'copy:chrome-ext-html', 'crx']);
};