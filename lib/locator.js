if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var tree = require('./tree');
	var lessCtx = require('./less/context');
	var scssCtx = require('./scss/context');
	var stringStream = require('../node_modules/emmet/lib/assets/stringStream');
	var cssSections = require('../node_modules/emmet/lib/utils/cssSections');
	var lessResolver = require('../node_modules/emmet/lib/resolver/less');
	var resolvers = {
		css: function(tree, options) {
			// transform tree to plain list
			var toList = function(node, out) {
				out = out || [];
				if (node && node.children) {
					// for better performance, don't use _.each or [].forEach iterators
					for (var i = 0, il = node.children.length, c; i < il; i++) {
						c = node.children[i];
						if (c.type != 'property') {
							out.push(c);
							toList(c, out);
						}
					}
				}

				return out;
			};

			return _.map(toList(tree), function(node) {
				var path = pathForNode(node, options);
				return {
					path: path,
					pathString: stringifyPath(path, options.skipPathPos),
					section: node
				};
			});
		},
		less: function(tree, options) {
			lessCtx.resolveSelectors(tree, options);
			var list = lessResolver.resolve(tree).filter(function(item) {
				return item.node.type !== 'property';
			});

			transformPaths(list);
			return _.map(list, function(item) {
				return {
					path: item.path,
					pathString: stringifyPath(item.path, options.skipPathPos),
					section: item.node
				};
			});
		},
		scss: function(tree, options) {
			// lessCtx.resolveSelectors(tree, options);
			// var list = lessResolver.resolve(tree).filter(function(item) {
			// 	return item.node.type !== 'property';
			// });

			// transformPaths(list);
			// return _.map(list, function(item) {
			// 	return {
			// 		path: item.path,
			// 		pathString: stringifyPath(item.path, options.skipPathPos),
			// 		section: item.node
			// 	};
			// });
		}
	};

	/**
	 * Creates JSON path to locate given node in tree
	 * @param {CSSNode} node
	 * @returns {String}
	 */
	function pathForNode(node, options) {
		if (!_.isObject(options)) {
			options = {asString: !!options};
		}

		if (!node.__path) {
			// cache path for faster lookups
			var parts = [];
			while(node.parent) {
				parts.push(pathComponentForNode(node));
				node = node.parent;
			}

			parts = parts.reverse();
			node.__path = parts;
		}
		
		return !options.asString ? node.__path : stringifyPath(node.__path);
	}

	/**
	 * @param {CSSNode} node
	 * @returns {Array}
	 */
	function pathComponentForNode(node) {
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

	/**
	 * Transforms paths, received from preprocessor resolver,
	 * to a fully-qualified paths. Path are resolved in-place
	 * @param  {Array} list List of resolved selectors
	 * @return {Array}
	 */
	function transformPaths(list) {
		var lookup = {};
		var stringify = function(path) {
			if (!path) {
				return '';
			}

			return _.map(path, function(sel) {
				return typeof sel == 'string' ? sel : sel[0] + '[' + sel[1] + ']';
			}).join('/');
		};

		_.each(list, function(item, i) {
			var prevItem = list[i - 1];
			var selString = '';
			_.each(item.path, function(sel, j) {
				selString += (selString ? '/' : '') + sel;
				if (!(selString in lookup)) {
					lookup[selString] = 1;
				} else if (prevItem /* && !~stringify(prevItem.path).indexOf(selString) */) {
					lookup[selString]++;
				}

				item.path[j] = [sel, lookup[selString]];
				selString += '[' + lookup[selString] + ']';
			});
		});

		return list;
	}

	/**
	 * Creates string representation of CSS path
	 * @param  {Array} path
	 * @return {String}
	 */
	function stringifyPath(path, skipPos) {
		if (_.isString(path)) {
			return path;
		}

		return path.map(function(p) {
			return p[0] + (!skipPos && p[1] > 1 ? '|' + p[1] : '');
		}).join('/');
	}

	return {
		/**
		 * Creates string representation of CSS path
		 * @param  {Array} path
		 * @return {String}
		 */
		stringifyPath: stringifyPath,

		/**
		 * Creates JSON path to locate given node
		 * @param {CSSNode} node
		 * @returns {String}
		 */
		pathForNode: pathForNode,

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
				return [cssSections.splitSelector(item[0]).join(', '), item[1]];
			});
		},

		/**
		 * Locates node in given tree by specified path
		 * @param  {CSSNode} parsedTree
		 * @param  {String} path
		 * @return {CSSNode}
		 */
		locate: function(parsedTree, path, options) {
			var lookup = {};
			options = _.extend({}, options || {}, {skipPathPos: false});
			var list = _.isArray(parsedTree) ? parsedTree : this.toList(parsedTree, options);
			_.each(list, function(item) {
				lookup[item.pathString.toLowerCase()] = item.section;
			});

			var key = stringifyPath(this.normalizePath(path), false);
			return lookup[key.toLowerCase()];
		},

		/**
		 * Guesses node location in given tree by specified path.
		 * This method might return partial match (e.g. match only 
		 * part of path)
		 * @param  {CSSNode} cssTree
		 * @param  {String} path
		 */
		guessLocation: function(cssTree, path, options) {
			path = this.normalizePath(path);
			
			var find = function(collection, path) {
				if (_.isArray(path)) path = path[0];
				return collection.filter(function(item) {
					return item.name() == path;
				});
			};

			var ctx = cssTree, part, items;
			while (part = path.shift()) {
				var node = this.locate(ctx, [part], options);
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
		},

		/**
		 * Transforms tree into a plain list of sections with selectors.
		 * Trees created created from preprocessors source are automatically
		 * resolved to CSS
		 * @param  {CSSNode} tree
		 * @param  {Object} options 
		 * @return {Array}
		 */
		toList: function(tree, options) {
			options = _.defaults(options || {}, {
				syntax: 'css',
				skipPathPos: true
			});

			if (!resolvers[options.syntax]) {
				throw new Error('Unknown syntax "' + options.syntax + '"');
			}

			return resolvers[options.syntax](tree, options);
		}
	};
});