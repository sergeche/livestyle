module.exports = function(grunt) {
	grunt.initConfig({
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
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-contrib-requirejs');

	// Default task.
	grunt.registerTask('default', ['copy:chrome']);
	grunt.registerTask('st', ['requirejs:st', 'copy:st']);
	grunt.registerTask('webkit', ['requirejs:webkit', 'copy:webkit']);
};