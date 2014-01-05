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

	var reUnit = /^(-?[\d\.]+)([%a-z]*)$/i;

	function variableValue(val) {
		var parts = expression.split(val);
		return parts.length == 1 ? val : parts;
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

	return {
		/**
		 * Evaluates value in given CSS node
		 * @param  {CSSNode} node
		 * @return {String}
		 */
		eval: function(node) {
			var value = node.value();
			// value = expression.eval(value, this.context(node));
			try {
				value = expression.eval(value, this.context(node));
			} catch(e) {
				if (e.message != 'function returned null') {
					throw e;
				}
			}
			return value;
		},

		/**
		 * Builds execution context for given CSS node. This
		 * context contains available variables and functions
		 * that can be used to evaluate expression
		 * @param  {CSSNode} node
		 * @return {Object}
		 */
		context: function(node) {
			var ctx = {};
			// collect variables.
			// in LESS, variables are scoped and lazy-loaded,
			// e.g. the last variable instance takes precedence 
			while (node.parent) {
				node.parent.properties().reverse().forEach(function(item) {
					if (item.name.charAt(0) == '@' && !(item.name in ctx)) {
						ctx[item.name] = variableValue(item.value);
					}
				});
				node = node.parent;
			}

			var varKeys = Object.keys(ctx);
			ctx = _.extend(ctx, functions);

			// evaluate each variable since it may contain other variable references
			varKeys.forEach(function(k) {
				try {
					ctx[k] = expression.eval(ctx[k]);
				} catch(e) {}
			});

			return ctx;
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