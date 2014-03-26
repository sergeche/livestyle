/**
 * Mixin resolver for SCSS.
 * Provides a context (list of valid mixins) for given node,
 * as well as some resolver utilities.
 *
 * The main method if `toList()` that transforms given CSS tree
 * into a plain node list with proper nesting paths and resolves 
 * nested mixins.
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var stringStream = require('emmet/lib/assets/stringStream');

	var reMixin = /^@mixin\s+([\w\-]+)/;
	var reMixinName = /^[\w\-]+/;

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

	function isPropertySet(node) {
		return node.type == 'section' && /:$/.test(node.name());
	}

	/**
	 * Returns mixin that corresponds to given `@include` node
	 * @param  {CSSNode} node 
	 * @return {CSSNode}
	 */
	function mixinForInclude(node) {
		var mixinCtx = mixinContextForNode(node);
		var m = node.value().match(reMixinName);
		if (!m) {
			return;
		}

		var mixinName = m[0];
		return mixinCtx[mixinName];
	}

	function walk(list, state) {
		state = state || {};
		var pathPrefix = state.prefix || [];
		var out = [], mixin;

		for (var i = 0, il = list.length, item, path, name; i < il; i++) {
			item = list[i];
			if (reMixin.test(item.name())) {
				continue;
			}

			if (item.type == 'section' && !isPropertySet(item)) {
				path = pathPrefix.slice(0);
				path.push(item.name());
				out.push({
					path: path,
					node: item
				});
				out = out.concat( walk(item.children, {prefix: path}) );
			} else if (isInclude(item)) {
				mixin = mixinForInclude(item);
				if (mixin) {
					out = out.concat( walk(mixin.children, {prefix: pathPrefix}) );
				}
			}
		}

		return out;
	};

	/**
	 * Extracts arguments from mixin definition
	 * @param  {String} name Mixin definition or reference (via `@include`)
	 * @return {Array} List of arguments
	 */
	function extractArgs(str) {
		var stream = stringStream(str);
		var argsString = '';
		var ch;
		while (ch = stream.next()) {
			if (ch == '(') {
				stream.start = stream.pos;
				stream.backUp(1);
				if (stream.skipToPair('(', ')', true)) {
					stream.backUp(1);
					argsString = stream.current();
					break;
				} else {
					throw new Error('Invalid mixin definition: ' + str);
				}
			}
		}

		return argsString ? splitArgs(argsString) : [];
	}

	/**
	 * Splits arguments definition string by arguments
	 * @param  {String} str
	 * @return {Array}
	 */
	function splitArgs(str) {
		var stream = stringStream(str.trim());
		var args = [];
		var ch;
		var mandatory = 0;
		var reVarName = /\$([\w\-]+)\s*(\:\s*)?/;

		var add = function(arg) {
			arg = arg.trim();
			if (!arg) {return;}

			var name = null, value = arg;
			var m = arg.match(reVarName);
			if (m) {
				name = m[1];
				value = arg.substr(m[0].length);
			}

			var a = {
				name: name,
				value: value || null,
				raw: arg
			};

			args.push(a);
			if (a.value === null) {
				mandatory++;
			}
		};

		while (ch = stream.next()) {
			if (ch == ',') {
				add(str.substring(stream.start, stream.pos - 1));
				stream.start = stream.pos;
			} else {
				stream.skipQuoted();
			}
		}

		add(stream.current());
		args.mandatory = mandatory;
		return args;
	}

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
		},

		mixinForInclude: mixinForInclude,

		/**
		 * Returns available mixins for given node
		 * @returns {Object}
		 */
		context: mixinContextForNode
	};
});