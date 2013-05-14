module.exports = function(grunt) {
	grunt.loadNpmTasks('grunt-contrib-copy');

	grunt.initConfig({
		copy: {
			chrome: {
				files: [
					{
						expand: true,
						flatten: true,
						src: ['./client/*.js', './client/extension/chrome/*.*'], 
						dest: './out/chrome/'
					}
				]
			}
		},
		watch: {
			chrome: {
				files: './client/**/*.*',
				tasks: ['copy:chrome'],
				options: {
					nospawn: true,
				}
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-watch');


	// Default task.
	grunt.registerTask('default', ['copy:chrome']);
};