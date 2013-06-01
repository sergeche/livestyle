require.config({
	baseUrl: "../",
	paths: {
		'lodash': 'vendor/lodash'
	}
});

require(['tree'], function(tree, locator, outline) {
	$('#parse-btn').on('click', function() {
		console.profile('Tree build');
		var tokens = tree.build($('#source').val());
		console.profileEnd('Tree build');
	});
});