/**
 * Variable resolver for LESS
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var expression = require('./expression');
	// var reIsVar = /^@/;
	var reIsVar = /^@(?!media\b)/;


	function isVariable(node) {
		return reIsVar.test(node.name());
	}

	return {
		collect: function(node, state) {
			var vars = {};
			node.children.forEach(function(child) {
				if (isVariable(child)) {
					vars[child.name()] = child.value();
				}
			});

			_.each(vars, function(v, k) {
				state.variables[k] = expression.eval(v, state.variables, true);
			});
		},
		resolve: function(node, state) {
			return isVariable(node);
		}
	};
});