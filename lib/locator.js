define(['lodash', 'tree'], function(_, tree) {

	/**
	 * @param {CSSNode} node
	 * @returns {Array}
	 */
	function pathForNode(node) {
		if (!node.parent) {
			return null;
		}

		var name = node.name();
		var siblings = node.parent.children;
		var pos = 1;

		for (var i = 0, il = siblings.length; siblings[i] !== node && i < il; i++) {
			if (siblings[i].name() === name) {
				pos++;
			}
		}

		return [name, pos];
	}


	return {
		/**
		 * Creates JSON path to locate given node
		 * @param {CSSNode} node
		 * @returns {String}
		 */
		createPath: function(node) {
			var parts = [];
			while(node.parent) {
				parts.push(pathForNode(node));
				node = node.parent;
			}

			return JSON.stringify(parts.reverse());
		},

		/**
		 * Normalizes given CSS path for matching it agains tree
		 * @param  {Array} path
		 * @return {Array}
		 */
		normalizePath: function(path) {
			if (_.isString(path)) {
				path = JSON.parse(path);
			}

			return path.map(function(item) {
				return [tree.parseSelectors(item[0]).join(', '), item[1]];
			});
		},

		/**
		 * Locates node in given tree by specified path
		 * @param  {CSSNode} cssTree
		 * @param  {String} path
		 * @return {CSSNode}
		 */
		locate: function(cssTree, path) {
			path = this.normalizePath(path);
			var ctx = cssTree, path, items;
			while (part = path.shift()) {
				items = ctx.children.filter(function(item) {
					return item.name() == part[0];
				});
				ctx = items[part[1] - 1];
				if (!ctx) {
					break;
				}
			}

			return ctx;
		},

		/**
		 * Locates node in given tree by specified character position
		 * @param  {CSSNode} cssTree
		 * @param  {Number} pos
		 * @return {CSSNode}
		 */
		locateByPos: function(cssTree, pos) {
			for (var i = 0, il = cssTree.children.length, item; i < il; i++) {
				item = cssTree.children[i];
				if (item.range().include(pos)) {
					return this.locateByPos(item, pos) || item;
				}
			}
		}
	};
});