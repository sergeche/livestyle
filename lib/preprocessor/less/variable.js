/**
 * Variable resolver for LESS.
 * In LESS all variables are lazy-evaluated, e.g. variables
 * must me added as-is and evaluated upon request
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var reIsVar = /^@(?!media\b)/;

	function isVariable(node) {
		return reIsVar.test(node.name());
	}

	return {
		collect: function(node, state) {
			node.children.forEach(function(child) {
				if (isVariable(child)) {
					state.variables[child.name()] = (child.value() || '').trim();
				}
			});
		},
		resolve: function(node, state) {
			return isVariable(node);
		}
	};
});