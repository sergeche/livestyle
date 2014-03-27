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
	var variables = require('./variables');
	var utils = require('./utils');
	var expression = require('../expression');

	var reMixin = /^@mixin\s+([\w\-]+)/;
	var reMixinName = /^[\w\-]+/;

	/**
	 * Returns mixin context for given list item
	 * @param  {Array} list List of parsed nodes
	 * @param  {Object} item List item or index in list
	 * @return {Object}
	 */
	function mixinContextForNode(node) {
		var ctx = {};
		utils.iterateByChain(node, function(item, i) {
			var m = reMixin.exec(item.name());
			if (m) {
				ctx[m[1].trim()] = {
					node: item,
					args: extractArgs(item.name())
				};
			}
		});

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

		/**
		 * Returns mixin info for given `@include` with proper variable scope
		 * @param  {CSSNode} node `@include` node
		 * @param  {Objetc} ctx  Mixins scope
		 * @return {Object}
		 */
		mixinForInclude: function(node, ctx) {
			var name = node.name().split('(', 1)[0].trim();
			var mixin = ctx[name];
			if (!mixin) {
				return null;
			}
			var args = extractArgs(node.name());
			var argsMap = {};
			args.forEach(function(a) {
				if (a.name) {
					argsMap[a.name] = a.value;
				}
			});

			// create local variable context to keep original context pristine
			var localCtx = {};
			mixin.args.forEach(function(arg, i) {
				// check if we have named argument
				if (arg.name in argsMap) {
					localCtx[arg.name] = argsMap[arg.name];
				} else if (args[i]) {
					localCtx[arg.name] = args[i].value;
				} else {
					localCtx[arg.name] = arg.value;
				}
				// TODO resolve splats: $var...
			});

			return {
				name: mixin.name,
				node: mixin.node,
				context: localCtx
			};
		},

		/**
		 * Returns available mixins for given node
		 * @returns {Object}
		 */
		context: mixinContextForNode,

		/**
		 * Parses mixin definition from node: returns mixin name
		 * and its variables
		 * @param  {CSSNode} node Parsed CSS node
		 * @return {Object}
		 */
		parse: function(node) {
			var m = reMixin.exec(node.name());
			return {
				name: m[1].trim(),
				args: extractArgs(node.name()),
				node: node
			};
		}
	};
});