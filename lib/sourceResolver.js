/**
 * Generic source resolver: takes string source (css, less, scss)
 * and transforms it into a resolved tree
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var ResolvedNode = require('./preprocessor/resolvedNode');
	var lessResolver = require('./preprocessor/less/resolver');
	var scssResolver = require('./preprocessor/scss/resolver');
	var tree = require('./tree');

	/**
	 * Simple CSS resolver: basically just wraps each node
	 * to a ResolvedNode object
	 * @param  {CSSNode} sourceTree 
	 * @return {ResolvedNode}
	 */
	function resolveCSS(node, parent) {
		var resolved = new ResolvedNode(node);
		if (parent) {
			parent.addChild(resolved);
		}
		node.children.forEach(function(child) {
			resolveCSS(child, resolved);
		});
		return resolved;
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

			return path.map(function(sel) {
				return typeof sel == 'string' ? sel : sel[0] + '[' + sel[1] + ']';
			}).join('/');
		};

		list.forEach(function(item, i) {
			var prevItem = list[i - 1];
			var selString = '';
			item.path.forEach(function(sel, j) {
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
	function stringifyPath(path) {
		if (typeof path == 'string') {
			return path;
		}

		return path.map(function(p) {
			return p[0] + (p[1] > 1 ? '|' + p[1] : '');
		}).join('/');
	}

	function toList(resolvedTree, options) {
		options = options || {};
		var list = transformPaths(resolvedTree.sectionList());
		return list.map(function(item) {
			return {
				path: item.path,
				pathString: stringifyPath(item.path, options.skipPathPos),
				section: item.node
			};
		});
	}

	var resolvers = {
		css: function(sourceTree, options) {
			return resolveCSS(sourceTree);
		},
		less: function(sourceTree, options) {
			return lessResolver.resolve(sourceTree);
		},
		scss: function(sourceTree, options) {
			return scssResolver.resolve(sourceTree);
		}
	};

	return {
		resolve: function(source, options) {
			options = options || {};
			if (source instanceof ResolvedNode) {
				return source;
			}
			
			var syntax = options.syntax || 'css';
			if (!resolvers[syntax]) {
				throw new Error('Unknown syntax "' + syntax + '"');
			}

			if (typeof source === 'string') {
				source = tree.build(source);
			}

			return resolvers[syntax](source, options);
		},
		toList: function(source, options) {
			return toList(this.resolve(source, options), options);
		}
	};
});