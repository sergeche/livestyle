/**
 * A proxy module for `css-expression` to parse and evaluate CSS expression
 * with LESS specifics
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var expression = require('css-expression');
	var tok = require('css-expression/lib/token');
	var stringStream = require('string-stream');
	var range = require('emmet/lib/assets/range');
	var utils = require('emmet/lib/utils/common');
	var logger = require('../../logger');

	var Context = expression.Context;

	return {
		/**
		 * Interpolates @{...} fragments in given string.
		 * @param  {String} str     String to interpolate
		 * @param  {Object} scope   Variable scope
		 * @param  {Object} options Additional options
		 * @return {String}
		 */
		interpolate: function(str, scope, options) {
			if (!str) {
				return str;
			}

			var tokens = this.findTokens(str);
			if (!tokens.length) {
				// nothing to evaluate
				return str;
			}

			var ctx = Context.create(scope);

			tokens.reverse().forEach(function(token) {
				var expr = '@' + str.substring(token.start + 2, token.end - 1);
				var result = void 0;

				try {
					result = expression.eval(expr, ctx);
				} catch (e) {
					logger.error('Unable to interpolate %s: %s', expr, e);
				}

				if (result === void 0) {
					result = expr;
				}
				str = utils.replaceSubstring(str, result.value, token);
			});

			return str;
		},

		/**
		 * Evaluates given expression with passed variables context
		 * @param  {String} expr  Expression to evaluate
		 * @param  {Object} scope Variables scope
		 * @return {String}       Result of expression evaluation
		 */
		eval: function(expr, scope) {
			if (!expr) {
				return expr;
			}
			var ctx = Context.create(scope);
			return expression(this.interpolate(expr, ctx), ctx);
		},

		/**
		 * Finds all interpolation tokens in given string
		 * @param  {String} str
		 * @return {Array} List of token ranges
		 */
		findTokens: function(str) {
			var tokens = [];
			var stream = stringStream(str), ch;
			while (ch = stream.next()) {
				if (ch == '@' && stream.peek() == '{') {
					stream.start = stream.pos - 1;
					if (!stream.skipToPair('{', '}', true)) {
						// invalid interpolation fragment in string
						return [];
					}
					tokens.push(range.create2(stream.start, stream.pos));
				}
			}

			return tokens;
		}
	};
});