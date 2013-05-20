/**
 * Sublime Text backend
 */
define(['lodash', 'tree', 'locator'], function(_, tree, locator) {
	/**
	 * Escape string to allow ST insert it as snippet
	 * without corruption
	 * @param  {String} str String to escape
	 * @return {String}
	 */
	function escape(str) {
		return str.replace(/\$/g, '\\$');
	}

	/**
	 * Returns editor payload with updated value of given CSS
	 * node
	 * @param  {CSSNode} node  Node to update
	 * @param  {String} value New node value
	 * @return {String} JSON payload for editor
	 */
	function updateTreeNode (node, value) {
		var oldValue = node.rawValue();
		var start = node.valueRange.start;
		var end = node.valueRange.end;
		// adjust start position to keep formatting
		if (/^(\s+)/.test(oldValue)) {
			start += RegExp.$1.length;
		}
		if (/(\s+)$/.test(oldValue)) {
			end -= RegExp.$1.length;
		}

		return JSON.stringify({
			start: start,
			end: node.valueRange.end,
			value: '${1:' + escape(value) + '}'
		});
	}

	/**
	 * Tries to guess node loction in CSS by given path
	 * and update it accordingly. If direct node wasn't found,
	 * tries to create it
	 * @param  {CSSNode} cssTree Parsed CSS tree
	 * @param  {Object} payload Browser data payload
	 * @return {Object}
	 */
	function guessAndUpdateCSS(cssTree, payload) {
		if (_.isString(payload)) {
			payload = JSON.parse(payload);
		}

		var loc = locator.guessLocation(cssTree, payload.path);
		if (loc) {
			if (!loc.rest) {
				// found property to update
				return updateTreeNode(loc.node, payload.value);
			}

			if (loc.rest.length == 1) {
				// found container but without value, 
				// let’s create it
				var editTree = emmet.require('cssEditTree').parse(escape(loc.node.toSource()));
				editTree.value(loc.rest[0][0], '${1:' + escape(payload.value) + '}');
				var r = loc.node.range();
				return JSON.stringify({
					start: r.start,
					end: r.end,
					value: editTree.source
				});
			}
		}
	}

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
				return updateTreeNode(node, payload.value);
			}

			return guessAndUpdateCSS(cssTree, payload);
		}
	};
});