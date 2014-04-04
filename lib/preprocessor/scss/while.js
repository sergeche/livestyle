/**
 * `@whlie` loop resolver for SCSS
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var $if = require('./if');
	var expression = require('./expression');
	var logger = require('../../logger');

	var reWhile = /^@while\s+/;

	return {
		resolve: function(node, state) {
			if (!reWhile.test(node.name())) {
				return false;
			}

			var expr = node.name().replace(reWhile, '').trim();
			var loopProtector = 10000;

			try {
				var val;
				while (loopProtector--) {
					val = expression.eval(expr, state.variables);
					if (!$if.isTrue(val)) {
						break;
					}
					state.next(node, state);
				}
			} catch (e) {
				logger.error('Unable eval to @while expression: ' + expr, e);
			}

			return true;
		}
	};
});