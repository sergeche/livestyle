/**
 * Resolves single SCSS property (with value)
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var ResolvedNode = require('../resolvedNode');
	var expression = require('./expression');
	var reIsVar = /^@/;

	return {
		resolve: function(node, state) {
			if (node.type !== 'property' || reIsVar.test(node.name())) {
				return false;
			}

			var ctx = state.variables;
			var out = new ResolvedNode(node);
			out.name = expression.interpolate(node.name(), ctx);
			out.value = expression.eval(node.value(), ctx, true);
			state.parent.addChild(out);
			return out;
		}
	};
});