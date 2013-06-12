require.config({
	baseUrl: "../",
	paths: {
		'lodash': 'vendor/lodash'
	}
});

require(['tree', 'sourcer', 'cssParser'], function(tree, sourcer, cssParser) {
	$('#parse-btn').on('click', function() {
		// console.profile('Tree build');
		// var tokens = tree.build($('#source').val());
		// console.profileEnd('Tree build');
		var val = $('#source').val();
		console.log(val.length);

		console.profile('Parse');
		var tokens = cssParser.parse(val);
		console.profileEnd('Parse');

		console.profile('Tree');
		var out = tree.build(tokens);
		console.profileEnd('Tree');

		console.profile('Patch');
		sourcer.applyPatch(out, {
			"path": [[".bmainpagefeatures__eitem",1]],
			"properties":[{
				"name": "font-size",
				"value": "21px",
				"index": 2
			}],
			"removed": []
		});
		console.profileEnd('Patch');
	});
});