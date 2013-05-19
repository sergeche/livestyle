module.exports = function(grunt) {
	grunt.initConfig({
		copy: {
			chrome: {
				files: [
					{
						expand: true,
						flatten: true,
						src: ['./lib/*.js', './lib/extension/chrome/*.*'], 
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
						dest: '/Users/Sergey/Library/Application Support/Sublime Text 2/Packages/Emmet/livestyle.js'
					}
				]
			}
		},
		watch: {
			chrome: {
				files: './lib/**/*.*',
				tasks: ['copy:chrome'],
				options: {
					nospawn: true,
				}
			},
			st: {
				files: './lib/backend/*.*',
				tasks: ['requirejs:st', 'copy:st'],
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
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-contrib-requirejs');

	// Default task.
	grunt.registerTask('default', ['copy:chrome']);
	grunt.registerTask('st', ['requirejs:st', 'copy:st']);
};