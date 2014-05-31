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
	var reImportant = /\s*\!important\s*$/;

	return {
		resolve: function(node, state) {
			if (node.type !== 'property' || reIsVar.test(node.name())) {
				return false;
			}

			if (!state.parent || state.parent.type === 'root') {
				// do not output properties into root
				return true;
			}

			var ctx = state.variables;
			var out = new ResolvedNode(node, state);
			var important = !!state.important;
			if (out.name !== '&') {
				// do not resolve &:extend()
				var value = node.value();
				if (reImportant.test(value)) {
					important = true;
					value = value.replace(reImportant, '');
				}

				out.name = expression.interpolate(node.name(), ctx);
				out.value = expression.eval(value, ctx, true);
				if (important) {
					out.value += ' !important';
				}
			}
			state.parent.addChild(out);
			return out;
		}
	};
});