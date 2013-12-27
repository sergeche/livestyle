require.config({
	baseUrl: '../',
	paths: {
		'lodash': 'vendor/lodash',
		'emmet': '../node_modules/emmet'
	}
});

require(['./tree', './locator', './debug/outline'], function(tree, locator, outline) {
	var editor = CodeMirror.fromTextArea($('#source')[0], {
		mode: 'text/css',
		theme: 'espresso',
		indentWithTabs: true,
		lineNumbers: true
	});

	var marker = null;

	function pos(ix) {
		return editor.getDoc().posFromIndex(+ix);
	}

	function createOutline() {
		var cssTree = tree.build(editor.getValue());
		var outlineHTML = outline.create(cssTree)
			.on('mouseover', '[data-range]', function(evt) {
				if (marker) {
					marker.clear();
				}

				var range = $(this).data('range').match(/(\d+)\s*,\s*(\d+)/);
				var start = +range[1], len = +range[2];
				marker = editor.getDoc().markText(
					pos(start), 
					pos(start + len), 
					{
						className: 'marker'
					}
				);
			})
			.on('mouseout', '[data-range]', function() {
				if (marker) {
					marker.clear();
					marker = null;
				}
			})
			.on('click', '.outline__item-name', function(evt) {
				var id = $(this).data('node-id');
				var node = cssTree.getById(id);
				if (node) {
					console.log(locator.createPath(node));
				} else {
					console.log('Unable to find node by id', id);
				}
			});

		$('.layout__sidebar').empty().append(outlineHTML);
	}

	createOutline();

	$('#reparse-btn').on('click', createOutline);
});