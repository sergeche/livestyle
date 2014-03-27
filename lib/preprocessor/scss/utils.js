/**
 * Some utility methods to properly traverse and extract
 * data from SASS structures
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	return {
		/**
		 * Iterates by given slice of array. Doesn’t actually creates
		 * `Array.slice()` to keep low GC activity
		 * @param  {Object}   data     Iterator data: `list`, `from`, `to`
		 * @param  {Function} callback Function to invoke on each element.
		 * Receives element and its index as arguments
		 */
		iterate: function(data, callback) {
			var list = Array.isArray(data) ? data : data.list;
			var from = data.from || 0;
			var to = ('to' in data) ? data.to : list.length;
			while (from < to) {
				callback(list[from], from++);
			}
		},

		/**
		 * Builds traversal chain for given node. The chain contains
		 * all parents and siblings for given node. This chain is used to 
		 * properly propagate list of available mixins and variables
		 * @param  {CSSNode} node 
		 * @return {Array}
		 */
		chain: function(node) {
			var chain = [];
			while (node && node.parent) {
				chain.push({
					list: node.parent.children,
					from: 0,
					to: node.index()
				});
			}
			chain.reverse();
			return chain;
		},

		iterateByChain: function(node, callback) {
			var that = this;
			this.chain(node).forEach(function(item) {
				that.iterate(item, callback);
			});
		}
	};
});