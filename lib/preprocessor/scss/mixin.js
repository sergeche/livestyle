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
	var expression = require('./expression');

	var reMixin = /^@mixin\s+([\w\-]+)/;
	var reInclude = /^@include/;
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

	/**
	 * Create local variables context for given mixin
	 * @param  {Object} mx   Parsed mixin definition
	 * @param  {Object} vars Outer variables scope
	 * @return {Object}
	 */
	function createLocalScope(mx, vars) {
		var localVars = Object.create(vars), allArgs = [];
		_.each(mx.context, function(value, name) {
			if (value) {
				value = expression.eval(value, vars, true);
			}

			localVars[name] = value;
			allArgs.push({
				name: name,
				value: value
			});
		});

		localVars.$args = allArgs;
		return localVars;
	}

	function resolveContent(node, state) {
		if (!state.mixinContent) {
			return;
		}

		state.mixinContent.forEach(function(child) {
			state.transform(child, state);
		});
	}

	return {
		resolve: function(node, state) {
			var name = node.name();
			if (reMixin.test(name)) {
				// save mixin definition
				var mx = this.parse(node);
				state.mixins[mx.name] = mx;
				return true;
			}

			if (name == '@content') {
				resolveContent(node, state);
				return true;
			}

			if (reInclude.test(name)) {
				// resolve mixin include
				var mx = this.mixinForInclude(node, state.mixins);
				if (!mx) {
					return true;
				}

				// var localState = _.defaults({
				// 	variables: createLocalScope(mx, state.variables),
				// 	mixinContent: mx.content
				// }, state);

				var localState = state.clone({
					variables: createLocalScope(mx, state.variables),
					mixinContent: mx.content
				});

				mx.node.children.forEach(function(child) {
					state.transform(child, localState);
				});

				return true;
			}

			return false;
		},

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