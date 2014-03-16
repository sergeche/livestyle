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
	var mq = require('../media-query');
	var nesting = require('./nesting');

	var reValidSections = /^@(media|supports)/;
	var reMixin = /^@mixin/;

	return {
		resolve: function(tree, options) {
			options = _.extend({
				nestOrder: 'parentFirst',
				nestedInsert: 'after'
			}, options);

			var list = preprocessor.toList(tree);
			list = mq.resolve(list, options);
			list = nesting.resolve(list, options);
			return list;
		}
	};
});