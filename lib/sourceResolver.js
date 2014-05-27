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
	var colors = require('./color');
	var expression = require('./expression');
	var expressionEval = require('./vendor/expression-eval');

	var reUnit = /^(-?[\d\.]+)([%a-z]*)$/i;

	/**
	 * Check if two values are of the same type,
	 * e.g. both are colors, numbers with same units etc.
	 * @param  {String}  v1
	 * @param  {String}  v2
	 * @return {Boolean}
	 */
	function hasSameType(v1, v2) {
		var m1 = v1.match(reUnit);
		var m2 = v2.match(reUnit);

		if (m1 && m2) {
			return m1[2] == m2[2];
		} else if (!m1 && !m2) {
			// colors, maybe?
			return colors.parse(v1) && colors.parse(v2);
		}

		return false;
	}

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

	/**
	 * Creates patched value version for given property node. 
	 * Preprocessors can have expressions as their values so
	 * we should not just replace this expression with value
	 * but try to modify this expression so it matches given value.
	 * @param  {ResolvedNode} node Node to patch
	 * @param  {String} expectedValue Expected node value
	 * @return {String}
	 */
	function patchNodeValue(node, expectedValue, context) {
		var actualValue = node.value;
		var exprParts = expression.split(node.ref.value());
		var actualParts = expression.split(actualValue);
		var expectedParts = expression.split(expectedValue);

		var state = {
			ctx: context || node.state.variables,
			valid: true,
			unsafe: false
		};

		// console.log('patching from "%s" to "%s"', actualValue, expectedValue);

		var out = [];
		expectedParts.forEach(function(expected, i) {
			if (!state.valid) {
				return;
			}

			var actual = actualParts[i];
			var expr = exprParts[i];

			if (!actual || !hasSameType(actual, expected)) {
				// it’s a new token or
				// values are of different type, can’t be mutually converted
				return out.push(expected);
			}
			
			if (actual === expected) {
				return out.push(expr);
			}

			if (!expr) {
				// give up: looks like a single expression
				// generated a multi-part value so we can’t 
				// do anything with it
				return state.valid = false;
			}

			try {
				var pe = expressionEval.parse(expr);
				out.push(expression.safeUpdate(state, pe, expected, actual));
			} catch(e) {
				logger.log('Unable to eval ' + expr + ': ' + e);
				return out.push(expected);
			}
		});
		
		return {
			value: state.valid ? out.join(' ') : actualValue,
			safe: !state.unsafe,
			valid: state.valid
		};
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

		patch: function(node, expectedValue, options) {
			options = options || {};
			if (options.syntax == 'less' || options.syntax == 'scss') {
				var resolved = patchNodeValue(node, expectedValue, options.context);
				if (resolved.safe || options.allowUnsafe) {
					return resolved.value;
				}
			}

			return expectedValue;
		},

		toList: function(source, options) {
			return toList(this.resolve(source, options), options);
		}
	};
});