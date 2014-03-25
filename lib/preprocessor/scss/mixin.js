/**
 * Mixin resolver for SCSS
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var reMixin = /^@mixin\s+(.+)$/;
	/**
	 * Finds mixin definitions within given list of nodes
	 * @param  {Array} list List of parsed CSS nodes
	 * @return {Object} Hash of mixins where each key is a mixin name.
	 */
	function findMixins(list) {
		var out = {};
		list.forEach(function(item) {
			var m = reMixin.exec(item.name());
			if (m) {
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
	function mixinContextForNode(node) {
		var ctx = {}, slice;
		while (node && node.parent) {
			// in SASS, mixins are not lazy-loaded, e.g. depending on
			// current node position there can be different mixins
			// with the same name
			slice = node.parent.children.slice(0, node.index());
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
	 * Finds all `@include` nodes in given list of nodes
	 * @param  {Array} list Array of parsed CSS nodes
	 * @return {Array} Returns list of located nodes, as well as
	 * some meta info about includes found
	 */
	function findIncludes(list) {
		var out = [];
		list.forEach(function(item, i) {
			if (item.name().toLowerCase() == '@include') {
				out.push({
					ix: i,
					name: item.value(),
					node: item
				});
			}
		});
		return out;
	}

	function isInclude(node) {
		return node.name().toLowerCase() == '@include';
	}

	function walk(list, state) {
		state = state || {};
		var out = [];
		var pathPrefix = state.prefix || [];
		var mixinCtx, mixin;

		for (var i = 0, il = list.length, item, path; i < il; i++) {
			item = list[i];
			if (reMixin.test(item.name())) {
				continue;
			}

			if (item.type == 'section') {
				path = pathPrefix.slice(0);
				path.push(item.name());
				out.push({
					path: path,
					node: item
				});
				out = out.concat( walk(item.children, {prefix: path}) );
			} else if (isInclude(item)) {
				mixinCtx = mixinContextForNode(item);
				mixin = mixinCtx[item.value()];
				if (mixin) {
					out = out.concat( walk(mixin.children, {prefix: pathPrefix}) );
				}
			}
		}

		return out;
	};

	return {
		/**
		 * Resolves mixins in given parsed tree. The primary goal of this
		 * resolver is to transform tree into a plain list of node with
		 * properly resolved mixin sections.
		 * This method should be used instead of `preprocessor.toList()`
		 * @param  {Array} list List of parsed CSS nodes
		 * @return {Array} Resolved list of parsed nodes
		 */
		toList: function(tree) {
			return walk(tree.children);
		}
	};
});