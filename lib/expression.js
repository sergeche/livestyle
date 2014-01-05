if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var colors = require('./color');
	var exprEvaluator = require('./vendor/expression-eval');
	var stringStream = require('../node_modules/emmet/lib/assets/stringStream.js');

	var reUnit = /^(-?[\d\.]+)([%a-z]*)$/i;
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

	var reSpace = /[\s\u00a0]/;
	return {
		/**
		 * Split expression by parts
		 * @param  {String} expr Expression to split
		 * @return {Array} Expression parts
		 */
		split: function(expr) {
			expr = expr.trim();
			var stream = stringStream(expr);
			var ops = '-+*/,';
			var parts = [], ch;

			while (ch = stream.next()) {
				if (reSpace.test(ch)) {
					// found space, it could be a part separator or
					// just an expression formatting
					stream.eatSpace();
					if (~ops.indexOf(stream.peek())) {
						// found operator: it’s a formatting
						stream.next();
						stream.eatSpace();
					} else {
						// it’s a part separator
						parts.push(stream.current().trim());
						stream.start = stream.pos;
					}
				} else if (ch == '(') {
					stream.backUp(1);
					stream.skipToPair('(', ')');
				} else if (ch == '"' || ch == "'") {
					stream.skipString(ch);
				}
			}

			parts.push(stream.current().trim());
			return _.compact(parts);
		},

		/**
		 * Evaluates given CSS expression
		 * @param  {String} expr      Expression to eval
		 * @param  {Object} variables Variables and functions hash used in expression
		 * @return {String}
		 */
		eval: function(expr, variables) {
			return _.map(this.split(expr), function(part) {
				return exprEvaluator.evaluate(part, variables);
			}).join(' ');
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
				var c = colors.parse(delta.value)
				var deltaValue = c ? colors.toDecimal(deltaValue) : parseFloat(deltaValue, 10);
				
				if (delta.sign == -1) {
					deltaValue *= -1;
				}

				safeValue += deltaValue;
				if (safeValue) {
					// safe value is not zero, convert it to string
					var sign = safeValue < 0 ? '-' : '';
					if (c) {
						c = colors.parse(Math.abs(safeValue));
						safeValue = colors.toCSS(c);
					} else {
						var m = reUnit.exec(delta);
						safeValue += m[2] || '';
					}

					safeValue = sign + safeValue;
				}

				return pe.replaceSafeToken(value)
			} else {
				// no safe token: simply add delta
				return pe.source + ' ' + delta.sign + ' ' + delta.value;
			}
		}
	};
});