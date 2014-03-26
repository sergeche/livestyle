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
	var reIsVar = /^\$/;
	var reIsMixin = /^@mixin/;

	function iterate(list, fn, from, to) {
		from = from || 0;
		if (typeof to == 'undefined') {
			to = list.length;
		}
		
		while (from < to) {
			fn(list[from], from++);
		}
	}

	function collectInnerVariablesForNode(node, ctx) {
		ctx = ctx || {};
		if (reIsVar.test(node.name())) {
			ctx[node.name()] = node.value();
		} else if (node.type == 'section' && !reIsMixin.test(node.name())) {
			iterate(node.children, function(node) {
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

		// first, build a chain of parents to traverse
		var chain = [];
		while (node && node.parent) {
			chain.unshift({
				list: node.parent.children,
				from: 0,
				to: node.index()
			});
		}

		// now, traverse the chain and look up each nested section
		// for available variables
		var saveVars = function(node, ix) {
			collectInnerVariablesForNode(node, ctx);
		};

		for (var i = 0, il = chain.length; i < il; i++) {
			iterate(chain.list, saveVars, chain.from, chain.to);
		}

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
			iterate(node.children, function(node) {
				collectInnerVariablesForNode(node, ctx);
			});

			return ctx;
		}
	};
});