/**
 * SCSS selector resolver: takes parsed section tree of SCSS selectors 
 * and produces new tree with resolved CSS selectors
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var preprocessor = require('../resolver');
	// var extend = require('./extend');
	// var context = require('./context');

	var reValidSections = /^@(media|supports)/;
	var reMixin = /^@mixin/;

	return {
		resolve: function(tree, options) {
			// context.resolveSelectors(tree, options);
			var list = preprocessor.resolve(tree, {
				nestOrder: 'parentFirst',
				nestedInsert: 'after'
				// ,
				// nestingProcessor: function(payload) {
				// 	var sels = payload.parent;
				// 	if (!sels._processed) {
				// 		sels = sels.map(extend.stripExtend);
				// 		sels._processed = true;
				// 		payload.parent = sels;
				// 	}
				// }
			});
			// list = extend.resolve(list);
			// list = this.removeMixins(list);
			return list;
		},

		/**
		 * Remove mixins that have no representation in 
		 * final CSS, e.g. ones with arguments
		 * @param  {Array} list
		 * @return {Array}
		 */
		removeMixins: function(list) {
			var hasMixin = function(p) {
				return reMixin.test(p);
			};

			return list.filter(function(item) {
				return !_.find(item.path, hasMixin);
			});
		}
	};
});