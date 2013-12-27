if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var tree = require('./tree');
	var stringStream = require('emmet/lib/assets/stringStream');

	/**
	 * @param {CSSNode} node
	 * @returns {Array}
	 */
	function pathForNode(node) {
		if (!node.parent) {
			return null;
		}

		if (!node.__sectionPath) {
			var name = node.name(), nameLower = name.toLowerCase();
			var siblings = node.parent.children;
			var pos = 1;

			for (var i = 0, il = siblings.length; siblings[i] !== node && i < il; i++) {
				if (siblings[i].name(true) === nameLower) {
					pos++;
				}
			}

			node.__sectionPath = [name, pos];
		}

		return node.__sectionPath;
	}

	function itemSelector(node, options) {
		options = _.extend({syntax: 'css'}, options || {});

		if (options.syntax == 'scss') {
			var sel = [], ctx = node, n;
			while (ctx.parent) {
				n = node.name();
				if (/^@media/i.test(n)) {
					if (!sel.length) {
						return n;
					}
					break;
				}
				sel.push(node.name());
				ctx = ctx.parent;
			}

			return sel.join(' ');
		}

		return node.name();
	}

	function mergeSCSSSelectors(parts) {
		var p, out = [];
		while (p = parts.pop()) {
			if (p.charAt(0) == '&') {
				out.push(parts.pop() + p.substr(1))
			} else {
				out.push(p);
			}
		}

		return out.reverse().join(' ');
	}

	return {
		/**
		 * Creates string representation of CSS path
		 * @param  {Array} path
		 * @return {String}
		 */
		stringifyPath: function(path, skipPos) {
			if (_.isString(path)) {
				return path;
			}

			return path.map(function(p) {
				return p[0] + (!skipPos && p[1] > 1 ? '|' + p[1] : '');
			}).join('/');
		},

		/**
		 * Creates JSON path to locate given node
		 * @param {CSSNode} node
		 * @returns {String}
		 */
		createPath: function(node, options) {
			if (!_.isObject(options)) {
				options = {asString: !!options};
			}

			if (!node.__path) {
				// cache path for faster lookups
				var parts = [];
				while(node.parent) {
					parts.push(pathForNode(node));
					node = node.parent;
				}

				parts = parts.reverse();

				if (options.syntax == 'scss') {
					// for SCSS dialect, merge nested selectors
					var s, mergedParts = [], tmpParts = [];
					var reDontMerge = /^@media/i;
					while (s = parts.shift()) {
						if (reDontMerge.test(s[0])) {
							if (tmpParts.length) {
								mergedParts.push([mergeSCSSSelectors(tmpParts), 1]);
								tmpParts = [];
							}
							mergedParts.push(s);
						} else {
							tmpParts.push(s[0]);
						}
					}

					if (tmpParts.length) {
						mergedParts.push([mergeSCSSSelectors(tmpParts), 1]);
					}

					parts = mergedParts;
				}

				node.__path = parts;
			}
			
			return !options.asString ? node.__path : this.stringifyPath(node.__path);
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
			var stream = stringStream(path);

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
		locate: function(cssTree, path, options) {
			options = options || {};

			if (options.syntax == 'scss') {
				return this.locateSCSS(cssTree, path)
			}

			path = this.normalizePath(path);
			var ctx = cssTree, items, part, partLower;
			while (part = path.shift()) {
				partLower = part[0].toLowerCase();
				items = _.filter(ctx.children, function(item) {
					var n = itemSelector(item, options);
					return n == part[0] || n.toLowerCase() == partLower;
				});

				ctx = items[part[1] - 1];
				if (!ctx) {
					break;
				}
			}

			return ctx;
		},

		locateSCSS: function(cssTree, path) {
			path = this.normalizePath(path);
			var that = this;
			var opt = {syntax: 'scss'};
			var allPaths = cssTree.all().map(function(node) {
				return {
					path: that.createPath(node, opt),
					node: node
				};
			});

			var items, part, partLower, pathPos = 0;
			while (part = path.shift()) {
				partLower = part[0].toLowerCase();
				allPaths = allPaths.filter(function(item) {
					if (item.path[pathPos]) {
						return item.path[pathPos][0].toLowerCase() == partLower;
					}
				});

				if (allPaths[part[1] - 1]) {
					allPaths = [allPaths[part[1] - 1]];
					pathPos++;
				} else {
					allPaths = null;
					break;
				}
			}

			return allPaths && allPaths[0] ? allPaths[0].node : null;
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