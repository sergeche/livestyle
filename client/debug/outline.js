define(['lodash', 'tree'], function(_, tree) {
	/**
	 * Renders CSS tree node to HTML
	 * @param {CSSNode} item 
	 * @returns {String}
	 */
	function renderItem(item) {
		var html = '';

		html += '<div class="outline__item outline__item_' + item.type + '">'
			+ '<span class="outline__item-name" data-node-id="' + item.id + '" data-range="' + item.nameRange + '">' 
			+ item.name() 
			+ '</span>'
			+ '<span class="outline__item-value" data-range="' + item.valueRange + '"></span>'
			+ item.children.map(renderItem).join('')
			+ '</div>';

		return html;
	}

	function rangeAsString(range) {
		return '<span class="outline__range">(' + range.start + ', ' + range.end + ')</span>';
	}

	return {
		create: function(cssTree) {
			if (_.isString(cssTree)) {
				cssTree = tree.build(cssTree);
			}
		
			return $('<div class="outline">' + cssTree.children.map(renderItem).join('') + '</div>');
		}
	};
});