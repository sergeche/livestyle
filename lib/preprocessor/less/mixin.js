/**
 * Mixin resolver for LESS.
 * A two-step operation:
 * 1. Collect mixins from current sections since in LESS they are
 * lazy-loaded
 * 2. Resolve mixin references from given section
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var expression = require('css-expression');
	var stringStream = require('string-stream');
	var selector = require('../selector');
	var property = require('./property');
	var nesting = require('./nesting');
	var variable = require('./variable');
	var lessExpression = require('./expression');
	var logger = require('../../logger');
	var Context = expression.Context;

	var reMixin = /^[.#@]/;
	var reMixinOnly = /^[#\.][\w-]+\s*\(/;
	var reIsVar = /^@/;
	var reImportant = /\s*\!important\s*$/;

	var MAX_CALL_STACK = 1024;
	var MAX_MIXIN_CALL = 10;

	function splitByGroups(expr) {
		var stream = stringStream(expr.trim()), ch;

		// first, split expression by groups, e.g. by comma
		var groups = [];
		while (ch = stream.next()) {
			if (ch == ',') {
				stream.backUp(1);
				groups.push(stream.current());
				stream.next();
				stream.start = stream.pos;
			} else if (ch == '(') {
				stream.backUp(1);
				stream.skipToPair('(', ')', true);
			}
		}

		groups.push(stream.current());
		return groups;
	}

	/**
	 * Parses mixin guards expressions
	 * @param  {String} expr
	 * @return {Array}
	 */
	function parseGuards(expr) {
		// extract expressions from each group, 
		// as well as some additional data
		return splitByGroups(expr).map(function(g) {
			var out = [];
			var negate = false;
			var stream = stringStream(g), ch, src;
			while (!stream.eol()) {
				if (stream.match('not', true)) {
					negate = true;
					continue;
				} else if (stream.peek() == '(') {
					stream.start = stream.pos + 1;
					if (stream.skipToPair('(', ')', true)) {
						stream.backUp(1);
						src = stream.current();
						out.push({
							negate: negate,
							source: src,
							expr: expression.tokenize(src)
						});

						negate = false;
						stream.next();
					} else {
						throw new Error('Closing brace in mixin guard expression not found: ' + expr);
					}
				}

				stream.next();
			}

			return out;
		});
	}

	/**
	 * Extracts guard condition from mixin definition (`when(...)`)
	 * @param  {String} name Mixin definition
	 * @return {Object}      Object with `name` (mixin name without guard)
	 * and `guards` (array of parsed guards) properties
	 */
	function extractGuard(name) {
		var m = name.match(/\swhen\b/);
		var guards = null;
		var valid = true;
		if (m) {
			try {
				guards = parseGuards(name.substring(m.index + 5));
			} catch(e) {
				logger.error('Unable to evaluate mixin guard: ' + name.substring(m.index + 5), e);
				valid = false;
			}
			
			name = name.substring(0, m.index);
		}

		return {
			name: name.trim(),
			guards: guards,
			valid: valid
		};
	}

	/**
	 * Parses mixin call signature: extracts arguments from given name
	 * @param  {String} name CSS property to parse
	 * @return {Object}      Object with clean name and arguments
	 */
	function parseSignature(name) {
		var stream = stringStream(name);
		var argsString = '';
		var ch;
		while (ch = stream.next()) {
			if (ch == '(') {
				name = stream.current(true);
				stream.start = stream.pos;
				stream.backUp(1);
				if (stream.skipToPair('(', ')', true)) {
					stream.backUp(1);
					argsString = stream.current();
					break;
				} else {
					throw new Error('Invalid mixin definition: ' + name);
				}
			}
		}

		return {
			name: name.trim(),
			args: argsString ? splitArgs(argsString) : []
		};
	}

	/**
	 * Check if commas are allowed as argument separators
	 * @param  {String} expr
	 * @return {Boolean}
	 */
	function commasAllowed(expr) {
		var stream = stringStream(expr.trim());
		while (ch = stream.next()) {
			if (ch == ';') {
				return false;
			}
			stream.skipQuoted();
		}

		return true;
	}

	/**
	 * Splits arguments definition string by arguments
	 * @param  {String} str
	 * @return {Array}
	 */
	function splitArgs(str) {
		str = str.trim();
		var stream = stringStream(str.trim()), ch;
		var args = [];
		var mandatory = 0;
		var allowCommas = commasAllowed(str);

		var add = function(arg) {
			arg = arg.trim();
			if (!arg) {return;}
			var parts = arg.split(':');

			var a = {
				name: parts.length > 1 ? parts.shift().trim() : null,
				value: parts.join(':').trim() || null,
				raw: arg
			};

			args.push(a);
			if (a.value === null) {
				mandatory++;
			}
		};

		while (ch = stream.next()) {
			if (ch == ';' || (ch == ',' && allowCommas)) {
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
	 * Find best mixin candidate for given mixin 
	 * reference definition
	 * @param  {Object} signature Mixin reference signature (name with optional arguments)
	 * @param  {Object} mixins    Collection of available mixins
	 * @return {Object}
	 */
	function findCandidates(signature, state) {
		if (typeof signature === 'string') {
			signature = parseSignature(signature);
		}

		var ctx = Context.create(state.variables);
		var name = lessExpression.interpolate(signature.name, ctx);
		name = normalizeName(name);

		var candidates = [], localName;
		for (var mxName in state.mixins) {
			localName = lessExpression.interpolate(mxName, ctx);
			if (localName === name) {
				candidates = candidates.concat(state.mixins[mxName]);
			}
		}

		if (!candidates.length) {
			return null;
		}

		// find candidates that match current arguments signature
		var matches = candidates.filter(function(item) {
			return matchesArguments(item, signature.args);
		});

		return matches.length ? matches : null;
	}

	/**
	 * Check if given mixin definition matches arguments signature
	 * @param  {Object} mixin Mixin definition
	 * @param  {Array} args  Invocation arguments
	 * @return {Boolean}
	 */
	function matchesArguments(mixin, args) {
		// find constants in mixin attributes and check 
		// if they matches invocation arguments
		for (var i = 0, il = mixin.args.length, a1, a2; i < il; i++) {
			a1 = mixin.args[i];
			a2 = args[i];
			if (a1.name === null && (!a2 || a1.value !== a2.value)) {
				return false;
			}
		}

		var al = args.length;
		var il = mixin.args.length;
		var mandatory = mixin.args.mandatory || 0;

		// check if we have enough arguments
		return al >= mandatory && (mixin.args.unlimited || al <= il);
		// return !(al < mandatory || al > il);
	}

	/**
	 * Check if given parsed mixin object matches
	 * guard expression for given context
	 * @param  {Object} mixin Parsed mixin object
	 * @param  {Object} ctx   Evaluation context
	 * @return {Boolean}
	 */
	function matchesGuard(mixin, ctx) {
		if (!mixin.guards) {
			// no guards: no need in evaluation
			return true;
		}

		ctx = Context.create(ctx);

		try {
			var guard, valid, result, isTrue;
			for (var i = 0, il = mixin.guards.length; i < il; i++) {
				valid = true;
				guards = mixin.guards[i];
				for (var j = 0, jl = guards.length; j < jl; j++) {
					result = expression.eval(guards[i].expr, ctx);
					isTrue = result && result.toPrimitive();
					if (guards[i].negate) {
						isTrue = !isTrue;
					}

					if (!isTrue) {
						valid = false;
						break;
					}
				}

				if (valid) {
					return true;
				}
			}
		} catch (e) {
			logger.error('Unable to evaluate guard expression for ' + mixin.name, e);
		}

		return false;
	}

	function isMixinOnly(sel) {
		return reMixinOnly.test(sel);
	}

	/**
	 * Normalizes mixin name: removes all operators, leaves
	 * fragments only
	 * @param  {String} name
	 * @return {String}
	 */
	function normalizeName(name) {
		return selector.create(name).parts().map(function(part) {
			return (reMixin.test(part) ? '' : '___') + part;
		}).join('');
	}

	/**
	 * Try to retreive mixins definitions from given node
	 * (including nested ones) and returns all posisble name 
	 * combinations
	 * @param  {CSSNode} node
	 * @return {Object} Hash of matched names (key) and their nodes (value)
	 */
	function captureMixinDefs(node, parent, out) {
		if (node.type === 'property') {
			return;
		}

		var name = node.name();
		var mxNames = selector.rules(name);

		if (!parent) {
			// top-level items must be either id or class,
			// nested items can be of any kind
			mxNames = mxNames.filter(function(sel) {
				return reMixin.test(sel);
			});
		}

		if (!mxNames.length) {
			return;
		}

		if (isMixinOnly(name)) {
			node.type = 'mixin-def';
		}

		out = out || {};
		mxNames.forEach(function(name) {
			var guardsDef = extractGuard(name);
			if (!guardsDef.valid) {
				// invalid guard expression, can’t use this mixin
				return;
			}

			name = guardsDef.name;

			if (parent) {
				name = nesting.nameForPath([parent, name]);
			}

			var normalizedName = saveMixin(name, node, guardsDef.guards, out);

			node.children.forEach(function(child) {
				captureMixinDefs(child, normalizedName, out);
			});
		});

		return out;
	}

	function saveMixin(name, node, guards, target) {
		var signature = parseSignature(name);
		var reRest = /\.{3}$/;

		// preprocess arguments of mixin definition:
		// there’s a bit different meaning of variable 
		// passed as argument
		var mandatory = 0, unlimited = false, rest = false;
		var args = signature.args.map(function(arg) {
			if (reRest.test(arg.raw)) {
				unlimited = true;
				rest = arg.raw.replace(reRest, '') || null;
				return null;
			}

			if (arg.name === null && reIsVar.test(arg.value)) {
				arg.name = arg.value;
				arg.value = null;
			}

			if (arg.value === null) {
				mandatory++;
			}

			return arg;
		}).filter(function(arg) {
			return !!arg;
		});

		args.mandatory = mandatory;
		args.unlimited = unlimited;
		args.rest = rest;

		name = normalizeName(signature.name);
		if (!target[name]) {
			target[name] = [];
		}

		target[name].push({
			name: name,
			args: args,
			node: node,
			guards: guards
		});

		return name;
	}

	/**
	 * Serializes mixin call into a string
	 * @param  {String} name Mixin name
	 * @param  {Object} args Mixin invocation arguments
	 * @return {String}
	 */
	function serialize(name, node, args) {
		return name + '[' + node.id + ']' + '(' + 
			Object.keys(args || {}).map(function(name) {
				return name + ': "' + args[name] + '"';
			}).join(', ') +
			')';
	}

	function callStackGuard(stack, mixin, args) {
		if (stack.length >= MAX_CALL_STACK) {
			return 'Maximum call stack size exceeded';
		}

		var serialized = serialize(mixin.name, mixin.node, args);
		var calls = 0;
		stack.forEach(function(name) {
			if (name === serialized) {
				calls++;
			}
		});

		if (calls >= MAX_MIXIN_CALL) {
			return 'Maximum call stack size exceeded for mixin "' + mixin.name + '"';
		}

		// say there are no errors
		stack.push(serialized);
		return false;
	}

	/**
	 * Populates object with mixin invocation arguments:
	 * splits named and positional arguments
	 * @param  {Array} args  Mixin invocation arguments
	 * @param  {State} state LESS transformation state
	 * @return {Object}
	 */
	function populateInvocationArguments(args, state) {
		var positional = [], named = {};
		args.forEach(function(a) {
			var value = expression(a.value, Context.create(state.variables));
			if (a.name) {
				named[a.name.trim()] = value;
			} else {
				positional.push(value);
			}
		});

		return {
			positional: positional,
			named: named
		};
	}

	/**
	 * Binds mixin call arguments with actual variable scope
	 * for given mixin
	 * @param  {Object} mixin      Mixin definition
	 * @param  {Object} invokeArgs Object with invocation arguments (from `populateInvocationArguments()`)
	 * @return {Object}            Local variable scope based on mixin arguments
	 */
	function bindArguments(mixin, invokeArgs, state) {
		// resolve arguments in mixin caller and map them
		// to mixin context
		var vars = {}, allArgs = [], callArgIx = 0;

		// first, map default attributes
		mixin.args.forEach(function(arg, i) {
			var value = arg.value;
			if (arg.name in invokeArgs.named) {
				// use named argument
				value = invokeArgs.named[arg.name];
			} else if (callArgIx < invokeArgs.positional.length) {
				// use positioned argument
				value = invokeArgs.positional[callArgIx++];
			}

			vars[arg.name] = value;
			allArgs.push(value);
		});

		var rest = [];
		while (callArgIx < invokeArgs.positional.length) {
			rest.push(invokeArgs.positional[callArgIx++]);
		}

		vars['@arguments'] = allArgs.concat(rest);
		vars['@arguments'].glue = rest.glue = ' ';

		if (reIsVar.test(mixin.args.rest || '')) {
			vars[mixin.args.rest] = rest;
		}

		return vars;
	}

	return  {
		/**
		 * Collects mixins from given section node. 
		 * Also overrides `type` property of mixin-only
		 * sections for easier filtering
		 * @param  {CSSNode} node 
		 * @param  {State} state
		 */
		collect: function(node, state) {
			var mixins = state.mixins;
			node.children.forEach(function(child) {
				captureMixinDefs(child, null, mixins);
			});
		},

		resolve: function(node, state) {
			if (node.type == 'mixin-def') {
				// do not output mixin-only definitions
				return true;
			}

			var name = node.name();
			if (node.type !== 'property' || !reMixin.test(name)) {
				// TODO: handle block mixins, e.g. sections with inner content
				return false;
			}

			var signature = parseSignature(name);
			var candidates = findCandidates(signature, state);
			if (!candidates) {
				// no suitable candidates: do not throw exception,
				// just ignore mixin reference
				return true;
			}

			var important = reImportant.test(node.value()), args;
			try {
				args = populateInvocationArguments(signature.args, state);
			} catch (e) {
				logger.error('Unable to populate "%s" mixin invocation arguments: %s', signature.name, e);
				return false;
			}

			// resolve properties in mixin
			candidates.forEach(function(mixin) {
				var vars = bindArguments(mixin, args, state);
				var innerState = state.clone({
					variables: vars,
					important: state.important || important
				});

				if (!innerState.mixinCallStack) {
					innerState.mixinCallStack = [];
				}

				if (!matchesGuard(mixin, innerState.variables)) {
					return;
				}

				var err = callStackGuard(innerState.mixinCallStack, mixin, vars);
				if (err) {
					return logger.error(err);
				}

				state.next(mixin.node, innerState);
			});

			return true;
		}
	};
});