require.config({
	baseUrl: '../',
	paths: {
		'lodash': 'vendor/lodash'
	}
});

require(['./diff'], function(diff) {
	document.getElementById('parse-btn').onclick = function() {
		var val1 = document.getElementById('source').value;

		console.profile('Diff');
		console.time('Diff');
		var patches = diff.diff(val1, val1, {syntax: 'less'});
		console.timeEnd('Diff');
		console.profileEnd('Diff');
	}
});