require.config({
	baseUrl: '../',
	paths: {
		'lodash': 'vendor/lodash',
		'emmet': '../node_modules/emmet'
	}
});

require(['./diff'], function(diff) {
	$('#parse-btn').on('click', function() {
		var val1 = $('#source1').val();
		var val2 = $('#source2').val();

		console.profile('Diff');
		console.time('Diff');
		var patches = diff.diff(val1, val2);
		console.timeEnd('Diff');
		console.profileEnd('Diff');
	});
});