require.config({
	baseUrl: '../',
	paths: {
		'lodash': 'vendor/lodash'
	}
});

require(['./diff', './logger'], function(diff, logger) {
	document.getElementById('parse-btn').onclick = function() {
		var val1 = document.getElementById('source').value;
		logger.silent(true);

		console.profile('Diff');
		console.time('Diff');
		var patches = diff.diff(val1, val1, {syntax: 'less'});
		console.timeEnd('Diff');
		console.profileEnd('Diff');
	}
});