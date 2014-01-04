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
	var zeroColor = '#000000';

	function variableValue(val) {
		var parts = expression.split(val);
		return parts.length == 1 ? val : parts;
	}

	function isZero(val) {
		if (val === zeroColor) {
			return true;
		}

		var m = val.match(reUnit);
		return m && m[1] === '0';
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
	 * Check if parsed expression (expression tokens list) contains
	 * function calls.
	 * @param  {Array} tokens
	 * @return {Number} How many function calls does expression
	 * contains
	 */
	function hasFunctionCalls(tokens) {
		return tokens.filter(function(item) {
			return item.type_ === 4;
		}).length;
	}

	/**
	 * Returns delta value between to expressions
	 * @param  {Object} ctx Evaluation context
	 * @param  {String} v1  First expression
	 * @param  {String} v2  Second expression
	 * @return {Object}     Object with `value` and `sign` properties
	 */
	function getDelta(ctx, v1, v2) {
		var sign = '+';
		var delta = expressionEval.evaluate(v2 + ' - ' + v1, ctx);

		if (delta === zeroColor) {
			// a zero color is possible in two situations:
			// 1. colors are equal
			// 2. second color is greater than first one
			var delta2 = expressionEval.evaluate(v1 + ' - ' + v2, ctx);
			if (delta2 !== zeroColor) {
				delta = delta2;
				sign = '-';
			}
		}

		if (isZero(delta)) {
			// values are equal
			return null;
		}

		if (delta.charAt(0) == '-') {
			sign = '-';
			delta = delta.substr(1);
		}

		return {
			value: delta,
			sign: sign
		};
	}

	function addDelta(expr, delta) {
		return expr + (delta ? ' ' + delta.sign + ' ' + delta.value : '');
	}

	function handleVariableReference(state, expected, actual, expr) {
		try {
			return addDelta(expr, getDelta(state.ctx, actual, expected));
		} catch(e) {}

		// unable to evaluate expression, use plain value
		// but mark it as unsafe
		state.unsafe = true;
		return expected;
	}

	function handleExpression(state, pe, expected, actual, expr) {
		var fnCalls = hasFunctionCalls(pe.tokens);
		if (!fnCalls) {
			return handleMathExpression(state, pe, expected, actual, expr);
		} else if (fnCalls == 1) {


		}

		return expected;
	}

	function handleMathExpression(state, pe, expected, actual, expr) {
		// find candidates for modification: those should be a tokens
		// with numbers or colors
		var candidates = pe.tokens.filter(function(t) {
			return r.type_ === 0;
		});

		if (!candidates.length) {
			// no available candidates, simply add delta
			return addDelta(expr, getDelta(state.ctx, actual, expected));
		}


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
			var handleVar = handleVariableReference.bind(this, state);

			console.log('patching from "%s" to "%s"', actualValue, expectedValue);

			var out = [];
			expectedParts.forEach(function(expected, i) {
				if (!state.valid) {return;}
				var actual = actualParts[i];
				var expr = exprParts[i];

				if (!actual || !hasSameType(actual, expected)) {
					// it’s a new token or
					// values are of different type, 
					// can’t be mutually converted
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

				var pe;
				try {
					pe = expressionEval.parse(expr);
				} catch(e) {
					return out.push(expected);
				}
				
				if (pe.tokens.length == 1) {
					// a simple expression: just a value or variable
					// reference
					if (pe.tokens[0].type_ == 3) {
						// A variable reference. Instead of replacing it,
						// add a modifier
						out.push(handleVar(expected, actual, expr));
					} else {
						// it’s a number or color, simply replace it
						out.push(expected);
					}
				} else {
					console.log(pe.tokens);
					out.push(expected);
				}
			});
			
			console.log('out', out);
			return {
				value: state.valid ? out.join(' ') : actualValue,
				safe: !state.unsafe,
				valid: state.valid
			};
		}
	}
});