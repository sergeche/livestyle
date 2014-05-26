if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var selector = require('./preprocessor/selector');
	var stringStream = require('emmet/lib/assets/stringStream');
	var sourceResolver = require('./sourceResolver');

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
				return [selector.rules(item[0]).join(', '), item[1]];
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
			var list = _.isArray(parsedTree) ? parsedTree : sourceResolver.toList(parsedTree, options);
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
		}
	};
});
