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
			var ctx = cssTree, items, part;
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
		 * Guesses node location in given tree by specified path.
		 * This method might return partial match (e.g. match only 
		 * part of path)
		 * @param  {CSSNode} cssTree
		 * @param  {String} path
		 */
		guessLocation: function(cssTree, path) {
			path = this.normalizePath(path);
			
			var find = function(collection, path) {
				if (_.isArray(path)) path = path[0];
				return collection.filter(function(item) {
					return item.name() == path;
				});
			};

			var ctx = cssTree, part, items;
			while (part = path.shift()) {
				var node = this.locate(ctx, [part]);
				if (!node) {
					items = find(ctx.children, part);
					if (items.length) {
						// TODO add better heuristics on detecting best match
						if (path[0]) {
							// try to find last node containing
							// next child
							node = _.last(items.filter(function(item) {
								return find(item.children, path[0]).length;
							}));
						}

						if (!node) {
							node = _.last(items);
						}
					}
				}

				if (!node) { // nothing found, stop here
					path.unshift(part);
					break;
				} else {
					ctx = node;
				}
			}

			return {
				found: ctx !== cssTree,
				node: ctx,
				rest: path.length ? path : null
			};
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