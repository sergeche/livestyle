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
	var stringStream = require('emmet/lib/assets/stringStream');

	var reMixin = /^@mixin\s+([\w\-]+)/;
	var reVarName = /(\$[\w\-]+)\s*(\:\s*)?/;

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
		 * Returns mixin info for given `@include` with proper variable scope
		 * @param  {CSSNode} node `@include` node
		 * @param  {Objetc} ctx  Mixins scope
		 * @return {Object}
		 */
		mixinForInclude: function(node, ctx) {
			var def = node.type == 'section' ? node.name() : node.value();
			def = def.replace(/^@include\s*/, '');

			var name = def.split('(', 1)[0].trim();
			var mixin = ctx[name];
			if (!mixin) {
				return null;
			}
			var args = extractArgs(def);
			var argsMap = {};
			args.forEach(function(a) {
				if (a.name) {
					argsMap[a.name] = a.value;
				}
			});

			// create local variable context to keep original context pristine
			var localCtx = {};
			mixin.args.forEach(function(arg, i) {
				var value = arg.value;
				if (value === '...') {
					value = _.pluck(args.slice(i), 'value');
				} else {
					if (arg.name in argsMap) {
						// use named argument
						value = argsMap[arg.name];
					} else if (args[i]) {
						// use positioned argument
						value = args[i].value;
					}
				}

				localCtx[arg.name] = value;
			});

			return {
				name: mixin.name,
				node: mixin.node,
				context: localCtx,
				content: node.type == 'section' ? node.children : null
			};
		},

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