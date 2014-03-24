/**
 * Mixin resolver for SCSS
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var reMixin = /^@mixin\s+(.+)$/;
	/**
	 * Finds mixin definitions within given list of nodes
	 * @param  {Array} list List of parsed CSS nodes
	 * @return {Object} Hash of mixins where each key is a mixin name.
	 */
	function findMixins(list) {
		var out = {};
		list.forEach(function(item) {
			var m = reMixin.exec(item.name()) {
				out[m[1].trim()] = item;
			}
		});

		return out;
	}

	/**
	 * Returns mixin context for given list item
	 * @param  {Array} list List of parsed nodes
	 * @param  {Object} item List item or index in list
	 * @return {Object}
	 */
	function mixinContextForListItem(list, item) {
		var ctx = {};
		var itemIx = typeof item == 'number' ? item : list.indexOf(item);
		item = list[itemIx];
		if (!item) {
			return ctx;
		}

		var node = item.node, slice;
		while (node && node.parent) {
			// in SASS, mixins are not lazy-loaded, e.g. depending on
			// current node position there can be different mixins
			// with the same name
			slice = node.parent.children.slice(node.index());
			_.each(findMixins(slice), function(v, k) {
				if (!(k in ctx)) {
					ctx[k] = v;
				}
			});
			node = node.parent;
		}

		return ctx;
	}

	/**
	 * Check if given node contains section node inside
	 * @param  {CSSNode} node
	 * @return {Boolean}
	 */
	function containsSection(node) {
		return node.children.some(function(item) {
			return item.type == 'section';
		});
	}

	return {
		/**
		 * Resolves mixins in given list of parsed nodes. This method will only
		 * resolve those selectors that contain nested sections
		 * @param  {Array} list List of parsed CSS nodes
		 * @return {Array} Resolved list of parsed nodes
		 */
		resolve: function(list) {
			var out = [];
			list.forEach(function(item, i) {
				if (item.name().toLowerCase() == '@include') {
					var mixinCtx = mixinContextForListItem(list, item);
					var refMixin = mixinCtx[item.value()];
					if (refMixin && containsSection(refMixin)) {
						// TODO insert resolved sections here
					}
				} else {
					out.push(item);
				}
			});
		}
	};
});