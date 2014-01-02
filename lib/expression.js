if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var exprEvaluator = require('./vendor/expression-eval.js');
	var stringStream = require('../node_modules/emmet/lib/assets/stringStream.js');

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
			var ops = '-+*/';
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
		}
	};
});