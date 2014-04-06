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
	var _ = require('lodash');
	var selector = require('../selector');
	var property = require('./property');
	var variable = require('./variable');
	var stringStream = require('emmet/lib/assets/stringStream');

	var reMixin = /^[.#]/;
	var reMixinOnly = /\)$/;
	var reIsVar = /^@/;
	var reImportant = /\s*\!important\s*$/;

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
							expr: expressionEval.parse(src)
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
	 * Extracts arguments from mixin definition
	 * @param  {String} name Mixin definition or reference
	 * @return {Array} List of arguments
	 */
	function mixinArgs(name) {
		var stream = stringStream(name);
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
					throw new Error('Invalid mixin definition: ' + name);
				}
			}
		}

		return argsString ? splitArgs(argsString) : [];
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
		var stream = stringStream(str.trim()), ch;
		var args = [];
		var mandatory = 0;
		var allowCommas = commasAllowed(str);

		var add = function(arg) {
			arg = arg.trim();
			if (!arg) {return;}
			var parts = arg.split(':');
			var a = {
				name: parts.shift(),
				value: parts.join(':').trim() || null,
				raw: arg
			};

			if (!reIsVar.test(a.name)) {
				a.constant = true;
				a.value = a.name;
			}

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
	 * @param  {String} dfn    Mixin reference definition
	 * @param  {Object} mixins Collection of available mixins
	 * @return {Object}
	 */
	function findCandidates(dfn, mixins) {
		var name = dfn.split('(')[0].trim();
		var candidates = mixins[name];
		if (!candidates) {
			return null;
		}

		// find candidates that match current arguments signature
		var args = mixinArgs(dfn);
		var matches = _.filter(candidates, function(item) {
			return matchesArguments(item, args);
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
			if (a1.constant && (!a2 || a1.value !== a2.value)) {
				return false;
			}
		}

		// check if we have enough arguments
		var al = args.length;
		var il = mixin.args.length;
		var md = mixin.args.mandatory || 0;

		return al >= il - md && al <= il;
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

		try {
			var guard, valid, result, isTrue;
			for (var i = 0, il = mixin.guards.length; i < il; i++) {
				valid = true;
				guards = mixin.guards[i];
				for (var j = 0, jl = guards.length; j < jl; j++) {
					result = guards[i].expr.evaluate(ctx);
					if (typeof result == 'boolean') {
						isTrue = result;
					} else {
						isTrue = result != 'false' || !!parseFloat(result);
					}
					
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

	return  {
		/**
		 * Collects mixins from given section node. 
		 * Also overrides `type` property of mixin-only
		 * sections for easier filtering
		 * @param  {CSSNode} node 
		 * @param  {State} state
		 */
		collect: function(node, state) {
			if (node.type === 'property') {
				return;
			}

			node.children.forEach(function(child) {
				if (child.type !== 'section') {
					return;
				}

				var name = item.name();
				var mxNames = selector
					.rules(name)
					.filter(function(sel) {
						return reMixin.test(sel);
					});

				if (!mxNames.length) {
					return;
				}

				if (reMixinOnly.test(name)) {
					child.type = 'mixin-def';
				}

				var guardsDef = extractGuard(name);
				if (!guardsDef.valid) {
					// invalid guard expression, can’t use this mixin
					return;
				}

				var mixins = state.mixins;
				var args = mixinArgs(name);
				mxNames.forEach(function(name) {
					if (!mixins[name]) {
						mixins[name] = [];
					}

					mixins[name].push({
						name: name,
						args: args,
						node: child,
						guards: guardsDef.guards
					});
				});
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

			var candidates = findCandidates(name, state.mixins);
			if (!candidates) {
				// no suitable candidates: do not throw exception,
				// just ignore mixin reference
				return true;
			}
			var important = reImportant.test(node.value());

			// resolve properties in mixin
			candidates.forEach(function(m) {
				// resolve arguments in mixin caller and map them
				// to mixin context
				var vars = {};
				// first, map default attributes
				m.args.forEach(function(a) {
					if (reIsVar.test(a.name)) {
						vars[a.name] = a.value;
					}
				});

				args.forEach(function(a, i) {
					vars[m.args[i].name] = expression.eval(value, state.variables, true);
				});

				var innerState = state.clone({variables: vars});
				if (!matchesGuard(m, innerState.variables)) {
					return;
				}

				var suffix = important ? ' !important' : '';
				innerState.next(m.node, innerState, function(child, state) {
					variable.collect(child, state);
					var prop = property.resolve(child, state);
					if (prop) {
						return prop.value += suffix;
					}

					state.transform(child, state);
				});
			});

			return true;
		}
	};
});