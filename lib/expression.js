if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var colors = require('./color');
	var exprEvaluator = require('./vendor/expression-eval');
	var functions = require('./preprocessor/functions');
	var logger = require('./logger');

	var reUnit = /^(-?[\d\.]+)([%a-z]*)$/i;
	var reComplexValue = /[\(\+\-\*\/)@\$]/;
	var reImportant = /\!important\s*$/;
	var zeroColor = '#000000';

	function isZero(val) {
		if (val === zeroColor) {
			return true;
		}

		var m = val.match(reUnit);
		return m && parseInt(m[1], 10) === 0;
	}

	/**
	 * Returns delta value between two expressions
	 * @param  {Object} ctx Evaluation context
	 * @param  {String} v1  First expression
	 * @param  {String} v2  Second expression
	 * @return {Object}     Object with `value` and `sign` properties
	 */
	function getDelta(ctx, v1, v2) {
		var sign = '+';
		var delta = exprEvaluator.evaluate('(' + v2 + ') - (' + v1 + ')', ctx);

		if (delta === zeroColor) {
			// a zero color is possible in two situations:
			// 1. colors are equal
			// 2. second color is greater than first one
			var delta2 = exprEvaluator.evaluate('(' + v1 + ') - (' + v2 + ')', ctx);
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

	function ev(expr, variables) {
		return exprEvaluator.evaluate(expr, variables);
	}

	function safeEv(expr, variables, fallback) {
		try {
			return ev(expr, variables);
		} catch (e) {
			logger.error('Unable to eval ' + expr, e);
		}

		if (typeof fallback == 'function') {
			return fallback(expr, variables);
		}

		return expr;
	}

	return {
		/**
		 * Split expression by parts
		 * @param  {String} expr Expression to split
		 * @return {Array} Expression parts
		 */
		split: functions._split,

		/**
		 * Evaluates given CSS expression
		 * @param  {String} expr      Expression to eval
		 * @param  {Object} variables Variables and functions hash used in expression
		 * @param  {Bloolean} safe Use safe evaluation: do not throw exceptions if
		 * expression can’t be parsed. If argument is a function, 
		 * it will be invoked with expression and context and its result
		 * will be used as value
		 * @return {String}
		 */
		eval: function(expr, variables, safe) {
			var fn = ev;
			if (safe) {
				fn = typeof safe == 'function' ? safe : safeEv;
			}

			if (!Array.isArray(expr)) {
				expr = [expr];
			}

			return expr.map(function(expr) {
				var hasImportant = reImportant.test(expr);
				if (hasImportant) {
					expr = expr.replace(reImportant, '');
				}

				return this.split(expr).map(function(part) {
					if (reComplexValue.test(part)) {
						part = fn(part, variables, safe);
					}
					return part;
				}).join(' ') + (hasImportant ? ' !important' : '');
			}, this).join(', ');
		},

		safeEval: function(expr, variables, fallback) {
			return this.eval(expr, variables, fallback || true);
		},

		/**
		 * Applies safe patching to given expression so it results 
		 * to `expected` value
		 * @param  {Object} state    Internal state and execution context
		 * @param  {Expression} pe   Parsed expression
		 * @param  {String} expected Expected value, e.g. the expected result
		 * of updated expression
		 * @param  {String} actual   Actual value, e.g. the value that expression
		 * currently evaluates
		 * @return {String}          Updates expression 
		 */
		safeUpdate: function(state, pe, expected, actual) {
			var safe = pe.safeToken(), delta;
			if (safe && safe.single) {
				// it’s a single-value safe expression
				return expected;
			}

			try {
				delta = getDelta(state.ctx, actual, expected);
			} catch (e) {
				// unable to evaluate expression, use plain value
				// but mark it as unsafe
				state.unsafe = true;
				return expected;
			}

			if (!delta) {
				return pe.source;
			}

			if (safe) {
				// we have a safe value: update it with delta
				var safeValue = pe.safeTokenValue(safe);
				var isColor = !reUnit.test(delta.value);
				var deltaValue = isColor ? colors.toDecimal(colors.parse(delta.value)) : parseFloat(delta.value, 10);
				
				if (delta.sign == '-') {
					deltaValue *= -1;
				}

				safeValue += deltaValue;
				if (safeValue) {
					// safe value is not zero, convert it to string
					if (isColor) {
						var c = colors.parse(Math.abs(safeValue));
						safeValue = (safeValue < 0 ? '-' : '') + colors.toCSS(c);
					} else {
						var m = reUnit.exec(delta.value);
						safeValue += m[2] || '';
					}
				}

				return pe.replaceSafeToken(safeValue);
			} else {
				// no safe token: simply add delta
				return pe.source + ' ' + delta.sign + ' ' + delta.value;
			}
		}
	};
});