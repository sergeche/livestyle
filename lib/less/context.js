/**
 * Creates evaluation context for given CSS node
 * and evaluates expression against it
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var expression = require('../expression');
	var expressionEval = require('../vendor/expression-eval');	
	var functions = require('./functions');
	var colors = require('../color');
	var stringStream = require('../../node_modules/emmet/lib/assets/stringStream');
	var logger = require('../logger');

	var reUnit = /^(-?[\d\.]+)([%a-z]*)$/i;
	var reInterpolation = /@\{([\w\-]*)\}/g;
	var reMixin = /^[^a-z\-@]/;

	function variableValue(val) {
		var parts = expression.split(val);
		return parts.length == 1 ? val : parts;
	}

	/**
	 * Collects variables scope for given node
	 * @param  {CSSNode} node
	 * @return {Object}
	 */
	function getVariablesScope(node) {
		var ctx = {};
		// collect variables.
		// in LESS, variables are scoped and lazy-loaded,
		// e.g. the last variable instance takes precedence 
		while (node.parent) {
			node.parent.properties().reverse().forEach(function(item) {
				if (item.name.charAt(0) == '@' && !(item.name in ctx)) {
					// ctx[item.name] = variableValue(item.value);
					ctx[item.name] = item.value;
				}
			});
			node = node.parent;
		}

		var varKeys = Object.keys(ctx);
		ctx = _.extend(ctx, functions);
		var scope = {};

		// evaluate each variable since it may contain other variable references
		varKeys.forEach(function(k) {
			try {
				ctx[k] = expression.eval(ctx[k], ctx);
			} catch(e) {
				logger.error('Unable to eval expression: ' + ctx[k], e);
			}
			scope[k] = ctx[k];
		});

		return scope;
	}

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
	 * Extracts arguments from mixin definition
	 * @param  {String} name Mixin definition or reference
	 * @return {Array} List of arguments
	 */
	function mixinArgs(name) {
		var stream = stringStream(name);
		var argsString = '';
		var ch;
		while (ch = stream.next()) {
			if (ch == '(') {
				stream.start = stream.pos;
				stream.backUp(1);
				if (stream.skipToPair('(', ')', true)) {
					stream.backUp(1);
					argsString = stream.current();
					break;
				} else {
					throw new Error('Invalid mixin definition: ' + name);
				}
			}
		}

		return argsString ? splitArgs(argsString) : [];
	}

	/**
	 * Splits arguments definition string by arguments
	 * @param  {String} str
	 * @return {Array}
	 */
	function splitArgs(str) {
		var stream = stringStream(str.trim());
		var args = [];
		var ch;
		var mandatory = 0;

		var add = function(arg) {
			arg = arg.trim();
			if (!arg) {return;}
			var parts = arg.split(':');
			var a = {
				name: parts.shift(),
				value: parts.join(':').trim() || null,
				raw: arg
			};

			args.push(a);
			if (a.value === null) {
				mandatory++;
			}
		};

		while (ch = stream.next()) {
			if (ch == ';') {
				add(str.substring(stream.start, stream.pos - 1));
				stream.start = stream.pos;
			} else if (ch === '"' || ch === "'") {
				stream.skipString(ch);
			}
		}

		add(stream.current());
		args.mandatory = mandatory;
		return args;
	}

	/**
	 * Finds all mixins for given node
	 * @param  {CSSNode} node
	 * @return {Object} Hash with available mixins. Each hash value
	 * contains array with different parametric mixins
	 */
	function findMixins(node) {
		var root = node.root();
		if (!root.__lessMixins) {
			var mixins = {};
			root.children.forEach(function(item) {
				if (item.type == 'section' && reMixin.test(item.name())) {
					var name = item.name().split('(')[0];
					if (!mixins[name]) {
						mixins[name] = [];
					}

					mixins[name].push({
						args: mixinArgs(item.name()),
						node: item
					});
				}
			});
			root.__lessMixins = mixins;
		}
		
		return root.__lessMixins;
	}

	/**
	 * Resolves mixin reference (passed as `node` argument):
	 * finds best candidate among `mixin` items and returnes 
	 * resolved properties
	 * @param  {CSSNode} node
	 * @param  {Object} mixins
	 * @return {Array}
	 */
	function resolveMixin(node) {
		var mixins = findMixins(node.parent);
		var name = node.name().split('(')[0];
		var candidates = mixins[name];
		var props = [];
		if (!candidates) {
			return props;
		}

		var args = mixinArgs(node.name());
		var match = _.filter(candidates, function(item) {
			var al = args.length;
			var il = item.args.length;
			var md = item.args.mandatory || 0;

			return al >= il - md && al <= il;
		});

		if (!match.length) {
			return props;
		}

		// resolve properties in mixin
		var ctx = module.exports.context(node.parent);
		match.forEach(function(m) {
			// resolve arguments in mixin caller and map them
			// to mixin context
			var vars = {};
			// first, map default attributes
			m.args.forEach(function(a) {
				vars[a.name] = a.value;
			});

			args.forEach(function(a, i) {
				vars[m.args[i].name] = expression.eval(a.raw, ctx);
			});

			var ctx = module.exports.context(m.node, vars);
			m.node.properties().forEach(function(p) {
				if (!injectMixin(p, props)) {
					p.value = expression.eval(p.value, ctx);
					p.index = -1;
					p.mixin = true;
					props.push(p);
				}
			});
		});

		return props;
	}

	function injectMixin(prop, out) {
		if (!prop.value && reMixin.test(prop.name)) {
			try {
				out.push.apply(out, resolveMixin(prop.node));
			} catch (e) {
				logger.warn('Unable to resolve mixin ' + prop.name, e);
			}

			return true;
		}
	}

	return module.exports = {
		/**
		 * Evaluates value in given CSS node
		 * @param  {CSSNode} node
		 * @return {String}
		 */
		eval: function(node, ctx) {
			var value = node.value();
			// value = expression.eval(value, this.context(node));
			try {
				value = expression.eval(value, ctx || this.context(node));
			} catch(e) {
				if (e.message != 'function returned null') {
					throw e;
				}
			}
			return value;
		},

		/**
		 * Resolves selectors of given tree
		 * @param  {CSSNode} tree 
		 * @return {CSSNode}
		 */
		resolveSelectors: function(tree) {
			var that = this;
			tree.all().forEach(function(node) {
				if (node.type === 'section') {
					var ctx = null;
					var name = node.name().replace(reInterpolation, function(str, varname) {
						if (!ctx) {
							ctx = that.context(node);
						}

						return ctx['@' + varname] || '';
					});
					node.setName(name);
				}
			});

			return tree;
		},

		/**
		 * Returns properties list for given node. Also includes
		 * properties from mixins
		 * @param  {CSSNode} 
		 * @return {Array}
		 */
		properties: function(node) {
			var props = [], mixins;
			node.properties().forEach(function(p) {
				if (!injectMixin(p, props)) {
					props.push(p);
				}
			});

			return props;
		},

		/**
		 * Builds execution context for given CSS node. This
		 * context contains available variables and functions
		 * that can be used to evaluate expression
		 * @param  {CSSNode} node
		 * @param {Object} vars Additional variables
		 * @return {Object}
		 */
		context: function(node, vars) {
			if (!node.__lessVars) {
				node.__lessVars = getVariablesScope(node);
			}

			return _.extend({}, node.__lessVars, functions, vars || {});
		},

		/**
		 * Creates patched value version for given property node. 
		 * Preprocessors can have expressions as their values so
		 * we should not just replace this expression with value
		 * but try to modify this expression so it matches given value.
		 * @param  {CSSNode} node Node to patch
		 * @param  {String} expectedValue Expected node value
		 * @return {String}
		 */
		patch: function(node, expectedValue) {
			var actualValue = this.eval(node);
			var exprParts = expression.split(node.value());
			var actualParts = expression.split(actualValue);
			var expectedParts = expression.split(expectedValue);

			var state = {
				ctx: this.context(node),
				valid: true,
				unsafe: false
			};

			// console.log('patching from "%s" to "%s"', actualValue, expectedValue);

			var out = [];
			expectedParts.forEach(function(expected, i) {
				if (!state.valid) {return;}
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
					return out.push(expected);
				}
			});
			
			return {
				value: state.valid ? out.join(' ') : actualValue,
				safe: !state.unsafe,
				valid: state.valid
			};
		}
	}
});