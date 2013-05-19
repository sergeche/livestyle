/**
 * Sublime Text backend
 */
define(['lodash', 'tree', 'locator'], function(_, tree, locator) {
	return {
		/**
		 * Returns updated part of `content`, which 
		 * is identified by CSS payload
		 * @param  {String} content CSS file content
		 * @param  {Object} payload CSS update payload
		 * @return {String}
		 */
		updatedPart: function(content, payload) {
			if (_.isString(payload)) {
				payload = JSON.parse(payload);
			}

			var cssTree = tree.build(content);
			var cssPath = payload.path;
			if (_.isString(cssPath)) {
				cssPath = JSON.parse(cssPath);
			}

			var node = locator.locate(cssTree, cssPath);
			if (node && node.type == 'property') {
				// direct hit, simply update value range
				var oldValue = node.rawValue();
				var start = node.valueRange.start;
				// adjust start position to keep formatting
				if (/^(\s+)/.test(oldValue)) {
					start += RegExp.$1.length;
				}

				return JSON.stringify({
					start: start,
					end: node.valueRange.end,
					value: '${1:%s}' % payload.value
				});
				
				// var editTree = emmet.require('cssEditTree').parseFromPosition(content, node.nameRange.start, true);
				// var originalRange = editTree.range(true);

				// var prop = _.last(cssPath);
				// var namedProps = editTree.getAll(prop[0]);
				// var propToEdit = namedProps[prop[1] - 1] || _.last(namedProps);

				// if (propToEdit) {
				// 	propToEdit.value(payload.value);
				// } else {
				// 	editTree.value(prop[0], payload.value);
				// }

				// return JSON.stringify({
				// 	start: originalRange.start,
				// 	end: originalRange.end,
				// 	value: editTree.source
				// });
			}
		}
	};
});