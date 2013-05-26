define(['lodash', 'tree'], function(_, tree) {
	if (typeof emmet == 'undefined') {
		try {
			emmet = require('vendor/emmet');
		} catch(e) {}
	}

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

	/**
	 * Creates string representation of CSS path
	 * @param  {Array} path
	 * @return {String}
	 */
	function stringifyPath(path) {
		return path.map(function(p) {
			return p[0] + (p[1] > 1 ? '|' + p[1] : '');
		}).join('/');
	}

	return {
		/**
		 * Creates JSON path to locate given node
		 * @param {CSSNode} node
		 * @returns {String}
		 */
		createPath: function(node, asString) {
			var parts = [];
			while(node.parent) {
				parts.push(pathForNode(node));
				node = node.parent;
			}

			parts = parts.reverse();
			return !asString ? parts : stringifyPath(parts);
		},

		/**
		 * Parses string CSS path into internal structure
		 * @param  {String} path CSS path
		 * @return {Array}
		 */
		parsePath: function(path) {
			if (!_.isString(path)) {
				return path;
			}

			if (path.charAt(0) == '[' || path.charAt(0) == '{') {
				return JSON.parse(path);
			}

			var parts = [], part, ch, ch2;
			var reIndex = /\|(\d+)$/;
			var stream = emmet.require('stringStream').create(path);

			while (ch = stream.next()) {
				switch(ch) {
					case '/':
						part = stream.current().trim();
						parts.push(part.substring(0, part.length - 1).trim());
						stream.start = stream.pos;
						break;
					case '"':
					case '\'':
						while (ch2 = stream.next()) {
							if (ch2 == '\\') {
								stream.next();
							} else if (ch2 == ch) {
								break;
							}
						}
						break;
				}
			}

			parts.push(stream.current().trim());
			return  _.compact(parts).map(function(item) {
				var ix = 1;
				item = item.replace(reIndex, function(str, p1) {
					ix = +p1;
					return '';
				});
				return [item, ix];
			});
		},

		/**
		 * Normalizes given CSS path for matching it agains tree
		 * @param  {Array} path
		 * @return {Array}
		 */
		normalizePath: function(path) {
			return this.parsePath(path).map(function(item) {
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