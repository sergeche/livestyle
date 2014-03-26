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
	var mixin = require('./mixin');


	function isPropertySet(node) {
		return node.type == 'section' && /:$/.test(node.name());
	}

	function isInclude(node) {
		return node.name().toLowerCase() == '@include';
	}

	return {
		resolve: function(tree, options) {
			options = options || {};

			var list = preprocessor.toList(tree);
			list = mq.resolve(list, options);
			list = nesting.resolve(list, options);
			list = extend.resolve(list, options);
			return list;
		},

		/**
		 * Returns list of properties for given node, including ones 
		 * resolved from mixins
		 * @return {Array} List of properties, including references to their origin nodes
		 */
		properties: function(node, options) {
			options = options || {};
			var props = [];
			var prefix = options.prefix || '';

			node.children.forEach(function(item) {
				if (item.type == 'property') {
					props.push({
						name: prefix + item.name(),
						value: item.value(),
						node: item
					});
				} else if (isPropertySet(item)) {
					// nested property set:
					// border: {
					//     width: 1px;
					//     color: red;
					// }
					var p = item.name().replace(/\s*:$/, '-');
					props = props.concat(this.properties(item, {prefix: p}));
				} else if (isInclude(item)) {
					var mx = mixin.mixinForInclude(item);
					if (mx) {
						props = props.concat(this.properties(mx));
					}
				}
			}, this);

			return props;
		}
	};
});