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
	var extend = require('./extend');

	var reValidSections = /^@(media|supports)/;
	var reMixin = /^@mixin/;

	/**
	 * Remove mixins that have no representation in 
	 * final CSS, e.g. ones with arguments
	 * @param  {Array} list
	 * @return {Array}
	 */
	function removeMixins(list) {
		var hasMixin = function(p) {
			return reMixin.test(p);
		};

		return _.filter(list, function(item) {
			return !_.find(item.path, hasMixin);
		});
	}

	return {
		resolve: function(tree, options) {
			options = options || {};

			var list = preprocessor.toList(tree);
			list = mq.resolve(list, options);
			list = nesting.resolve(list, options);
			list = extend.resolve(list, options);
			return removeMixins(list);
		}
	};
});