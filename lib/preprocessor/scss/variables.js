/**
 * Variables resolver for SCSS.
 * Provides variable context (list of valid variables) for given node
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var utils = require('./utils');

	var reIsVar = /^\$/;
	var reIsMixin = /^@mixin/;

	function collectInnerVariablesForNode(node, ctx) {
		ctx = ctx || {};
		if (reIsVar.test(node.name())) {
			ctx[node.name()] = node.value();
		} else if (node.type == 'section' && !reIsMixin.test(node.name())) {
			utils.iterate(node.children, function(node) {
				collectVariablesForNode(node, ctx);
			});
		}

		return ctx;
	}

	/**
	 * Find all variables for scope of given node
	 * @param  {CSSNode} node
	 * @return {Object}
	 */
	function findVariables(node) {
		var ctx = {};
		// in SCSS, variables are NOT scoped or lazy-loaded.
		// The value of variable can be changed depending on
		// position of context node

		utils.iterateByChain(node, function(node, ix) {
			collectInnerVariablesForNode(node, ctx);
		});

		return ctx;
	}

	return {
		/**
		 * Returns variables context for given node
		 * @param  {CSSNode} node    
		 * @param  {Object} options Additional options, such as dependencies
		 * @return {Object}
		 */
		context: function(node, options) {
			return findVariables(node);
		},

		/**
		 * Returns inner variables context for given node, e.g.
		 * context without variables defined outside of node
		 * @param  {CSSNode} node 
		 * @return {Object}
		 */
		innerContext: function(node) {
			var ctx = {};
			utils.iterate(node.children, function(node) {
				collectInnerVariablesForNode(node, ctx);
			});

			return ctx;
		}
	};
});