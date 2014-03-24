/**
 * A common resolver for proprcessors: resolves nesting,
 * &-references, etc. in given parsed tree
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var nesting = require('./nesting');
	var mq = require('./media-query');

	// function copy(target, source) {
	// 	for (var p in source) if (source.hasOwnProperty(p)) {
	// 		if (!(p in target)) {
	// 			target[p] = source[p];
	// 		}
	// 	}

	// 	return target;
	// }

	return {
		/**
		 * Makes initial resolving of parsed preprocessor
		 * source tree: nesting, &-references
		 * @param  {CSSNode} tree 
		 * @return {Array} Plain list of tree resolved nodes
		 */
		resolve: function(tree, options) {
			var list = tree.sectionList();
			list = mq.resolve(list, options);
			list = nesting.resolve(list, options);
			return list;
		},

		/**
		 * Converts given tree to array of nodes
		 * @return {CSSNode} node
		 */
		toList: function(node, out) {
			throw "Deprecated call of toList() method";
		}
	};
});