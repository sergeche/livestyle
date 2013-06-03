require.config({
	baseUrl: "../",
	paths: {
		'lodash': 'vendor/lodash'
	}
});

require(['tree', 'sourcer'], function(tree, sourcer) {
	$('#parse-btn').on('click', function() {
		// console.profile('Tree build');
		// var tokens = tree.build($('#source').val());
		// console.profileEnd('Tree build');
		var val = $('#source').val();
		console.profile('Patch');

		sourcer.applyPatch(val, {
			"path": [[".bmainpagefeatures__eitem",1]],
			"properties":[{
				"name": "font-size",
				"value": "21px",
				"index": 2
			}],
			"removed": null
		});
		console.profileEnd('Patch');
	});
});