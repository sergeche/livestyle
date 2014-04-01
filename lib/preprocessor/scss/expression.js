/**
 * Library for working with expression evaluation in SCSS
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var expression = require('../../expression');
	var stringStream = require('emmet/lib/assets/stringStream');
	var range = require('emmet/lib/assets/range');
	var utils = require('emmet/lib/utils/common');

	function unquote(str) {
		return str.replace(/^["']|["']$/g, '');
	}

	return {
		/**
		 * Interpolates #{...} fragments in given string.
		 * @param  {String} str     String to interpolate
		 * @param  {Object} ctx     Evaluation context. Can be a function
		 * which will be evaluated only during interpolatoin 
		 * (lazy context propagation)
		 * @param  {Object} options Additional options
		 * @return {String}
		 */
		interpolate: function(str, ctx, options) {
			var tokens = this.findTokens(str);
			if (!tokens.length) {
				// nothing to evaluate
				return str;
			}

			tokens.reverse();
			if (typeof ctx == 'function') {
				ctx = ctx();
			}

			tokens.forEach(function(token) {
				var expr = str.substring(token.start + 2, token.end - 1);
				var result = expression.eval(expr, ctx, true);
				str = utils.replaceSubstring(str, unquote(result), token);
			});

			return str;
		},

		/**
		 * Evaluates given expression with passed variables context
		 * @param  {String} expr Expression to evaluate
		 * @param  {Object} ctx  Variables context
		 * @param  {Boolean} safe Use safe evaluation (e.g. do not throw exception
		 * if expressoin cannot be evaluated, return original expression instead)
		 * @return {String}      Result of expression evaluation
		 */
		eval: function(expr, ctx, safe) {
			return expression.eval(expr, ctx, safe);
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
				if (ch == '#' && stream.peek() == '{') {
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