/**
 * Creates evaluation context for given CSS node
 * and evaluates expression against it
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var expression = require('../expression');
	var expressionEval = require('../vendor/expression-eval');	
	var colors = require('../color');
	var stringStream = require('../../node_modules/emmet/lib/assets/stringStream');
	var cssSection = require('../../node_modules/emmet/lib/utils/cssSections');
	var logger = require('../logger');
	var dependencies = require('../dependencies');

	var reUnit = /^(-?[\d\.]+)([%a-z]*)$/i;
	var reInterpolation = /@\{([\w\-]*)\}/g;
	var reVar = /@([\w\-]+)/g;
	var reMixin = /^[^a-z\-@]/;
	var reIsVar = /^@/;
	var reImportant = /\s*\!important\s*$/;

	function variableValue(val) {
		var parts = expression.split(val);
		return parts.length == 1 ? val : parts;
	}

	function fastCopy(obj) {
		for (var i = 1, arg, keys; i < arguments.length; i++) {
			arg = arguments[i];
			if (!arg) {
				continue;
			}

			keys = Object.keys(arg);
			for (var j = keys.length - 1; j >= 0; j--) {
				obj[keys[j]] = arg[keys[j]];
			}
		}

		return obj;
	}

	/**
	 * Find all variables for scope of given node
	 * @param  {CSSNode} node
	 * @return {Object}
	 */
	function findVariables(node) {
		var ctx = {}, props, item;
		// collect variables.
		// in LESS, variables are scoped and lazy-loaded,
		// e.g. the last variable instance takes precedence 
		while (node) {
			props = node.properties();
			for (var i = props.length - 1; i >= 0; i--) {
				item = props[i];
				if (reIsVar.test(item.name) && !(item.name in ctx)) {
					// ctx[item.name] = variableValue(item.value);
					ctx[item.name] = item.value;
				}
			}
			node = node.parent;
		}

		return ctx;
	}

	/**
	 * Evaluates given variables
	 * @param  {Object} ctx Variables scope
	 * @return {Object}
	 */
	function evalVars(ctx) {
		// evaluate each variable since it may contain other variable references
		for (var k in ctx) {
			ctx[k] = expression.safeEval(ctx[k], ctx, evalFallback);
		}

		return ctx;
	}

	/**
	 * Collects variables scope for given node
	 * @param  {CSSNode} node
	 * @return {Object}
	 */
	function getVariablesScope(node) {
		return evalVars(findVariables(node));
	}

	function getFromDep(options, key, fn) {
		if (!options || !options.deps) {
			return {};
		}

		key = options.file ? options.file + ':::' + key : null;
		var ctx = dependencies.cachedValue(key, options.deps, fn);
		return Object.create(ctx);
	}

	/**
	 * Returns variables scope for dependencies in given options
	 * @param  {Object} options
	 * @return {Object}
	 */
	function depVars(options) {
		return getFromDep(options, 'vars', depVarsFactory);
	}

	/**
	 * Factory function that returns variables scopes
	 * for given trees (dependencies)
	 * @param  {Array} trees Dependecy trees
	 * @return {Object}
	 */
	function depVarsFactory(trees) {
		var ctx = {};
		trees.forEach(function(t) {
			ctx = fastCopy(ctx, findVariables(t));
		});
		return evalVars(ctx);
	}

	/**
	 * Returns dependencies mixins
	 * @param  {Object} options
	 * @return {Object}
	 */
	function depMixins(options) {
		return getFromDep(options, 'mixins', depMixinsFactory);
	}

	/**
	 * Factory function that returns variables scopes
	 * for given trees (dependencies)
	 * @param  {Array} trees Dependecy trees
	 * @return {Object}
	 */
	function depMixinsFactory(trees) {
		var ctx = {};
		trees.forEach(function(t) {
			ctx = fastCopy(ctx, findMixins(t));
		});
		return ctx;
	}

	/**
	 * Check if two values are of the same type,
	 * e.g. both are colors, numbers with same units etc.
	 * @param  {String}  v1
	 * @param  {String}  v2
	 * @return {Boolean}
	 */
	function hasSameType(v1, v2) {
		var m1 = v1.match(reUnit);
		var m2 = v2.match(reUnit);

		if (m1 && m2) {
			return m1[2] == m2[2];
		} else if (!m1 && !m2) {
			// colors, maybe?
			return colors.parse(v1) && colors.parse(v2);
		}

		return false;
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

		var allowCommas = true;
		// pre-check: can we use comma as arguments separator?
		while (ch = stream.next()) {
			if (ch == ';') {
				allowCommas = false;
				break;
			} else {
				stream.skipQuoted();
			}
		}

		stream.pos = 0;

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
	 * Finds all mixins for given node
	 * @param  {CSSNode} node
	 * @return {Object} Hash with available mixins. Each hash value
	 * contains array with different parametric mixins
	 */
	function findMixins(node) {
		var root = node.root();
		if (!root.__lessMixins) {
			var mixins = {};
			root.children.forEach(function(item) {
				if (item.type == 'section' && reMixin.test(item.name())) {
					var name = item.name();
					var guardsDef = extractMixinGuard(name);
					if (!guardsDef.valid) {
						// invalid guard expression, can’t use this mixin
						return;
					}

					var name = guardsDef.name.split('(')[0].trim();
					if (!mixins[name]) {
						mixins[name] = [];
					}

					mixins[name].push({
						name: name,
						args: mixinArgs(item.name()),
						node: item,
						guards: guardsDef.guards
					});
				}
			});
			root.__lessMixins = mixins;
		}
		
		return root.__lessMixins;
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
	 * Extracts guard condition from mixin definition (`when(...)`)
	 * @param  {String} name Mixin definition
	 * @return {Object}      Object with `name` (mixin name without guard)
	 * and `guards` (array of parsed guards) properties
	 */
	function extractMixinGuard(name) {
		var m = name.match(/\swhen\b/);
		var guards = null;
		var valid = true;
		if (m) {
			try {
				guards = parseMixinGuards(name.substring(m.index + 5));
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
	 * Parses mixin guards expressions
	 * @param  {String} expr
	 * @return {Array}
	 */
	function parseMixinGuards(expr) {
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

		// then extract expressions from each group, 
		// as well as some additional data
		return groups.map(function(g) {
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
						throw new Error('Closing brace not found');
					}
				}

				stream.next();
			}

			return out;
		});
	}

	/**
	 * Check if given parsed mixin object matches
	 * guard expression for given context
	 * @param  {Object} mixin Parsed mixin object
	 * @param  {Object} ctx   Evaluation context
	 * @return {Boolean}
	 */
	function mixinMatchesGuard(mixin, ctx) {
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


	/**
	 * Resolves mixin reference (passed as `node` argument):
	 * finds best candidate among `mixin` items and returnes 
	 * resolved properties
	 * @param  {CSSNode} node
	 * @param  {Object} mixins
	 * @return {Array}
	 */
	function resolveMixin(node, important, options) {
		var mixins = fastCopy(depMixins(options), findMixins(node.parent));

		var name = node.name();
		important = important || reImportant.test(name);
		if (important) {
			name = name.replace(reImportant, '');
		}

		name = name.split('(')[0];
		var candidates = mixins[name];
		var props = [];
		if (!candidates) {
			return props;
		}

		// find candidates that match current arguments signature
		var args = mixinArgs(node.name());
		var matches = _.filter(candidates, function(item) {
			return matchesArguments(item, args);
		});

		if (!matches.length) {
			return props;
		}

		// resolve properties in mixin
		// var ctx = module.exports.context(node.parent);
		var ctx = module.exports.context(node, options);
		matches.forEach(function(m) {
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
				vars[m.args[i].name] = expression.safeEval(a.raw, ctx, evalFallback);
			});

			var ctx = fastCopy(module.exports.context(m.node), vars);
			if (!mixinMatchesGuard(m, ctx)) {
				return;
			}

			var suffix = important ? ' !important' : '';
			m.node.properties().forEach(function(p) {
				if (!injectMixin(p, props, important, options)) {
					p.value = expression.safeEval(p.value, ctx, evalFallback) + suffix;
					p.index = -1;
					p.mixin = true;
					props.push(p);
				}
			});
		});

		return props;
	}

	function injectMixin(prop, out, important, options) {
		if (!prop.value && reMixin.test(prop.name)) {
			try {
				out.push.apply(out, resolveMixin(prop.node, important, options));
			} catch (e) {
				logger.warn('Unable to resolve mixin ' + prop.name, e);
			}

			return true;
		}
	}

	function evalFallback(expr, ctx) {
		var stream = stringStream(expr), ch, ch2, m;
		var out = '';
		while (ch = stream.next()) {
			if (ch == '~') {
				stream.start = stream.pos;
				if (stream.skipQuoted(true)) {
					out += expr.substring(stream.start + 1, stream.pos - 1);
					continue;
				}
			} else if (ch == '@' && (m = stream.match(/^[\w\-]+/, true))) {
				var name = '@' + m[0];
				if (name in ctx) {
					out += ctx[name];
					continue;
				}
			}

			out += ch;
		}

		return out;
	}

	return module.exports = {
		/**
		 * Evaluates value in given CSS node
		 * @param  {CSSNode} node
		 * @return {String}
		 */
		eval: function(node, ctx) {
			var value = node.value();
			// value = expression.eval(value, this.context(node));
			try {
				value = expression.eval(value, ctx || this.context(node));
			} catch(e) {
				if (e.message != 'function returned null') {
					throw e;
				}
			}
			return value;
		},

		/**
		 * Resolves selectors of given tree
		 * @param  {CSSNode} tree 
		 * @return {CSSNode}
		 */
		resolveSelectors: function(tree, options) {
			var that = this;

			tree.all().forEach(function(node) {
				if (node.type === 'section') {
					var ctx = null;
					var fnReplace = function(str, varname) {
						if (!ctx) {
							ctx = that.context(node, options);
						}

						return ctx['@' + varname] || '';
					};

					var name = node.name().replace(reInterpolation, fnReplace);

					if (/^\s*@media\b/.test(name)) {
						// in case of selectors with `()` (like media queries),
						// variables can be referenced as `@var`, not `@{var}`
						name = name.replace(/\((.+?)\)/, function(str) {
							return str.replace(reVar, fnReplace);
						});
					}

					node.setName(name);
				}
			});

			return tree;
		},

		/**
		 * Returns properties list for given node. Also includes
		 * properties from mixins
		 * @param  {CSSNode} 
		 * @return {Array}
		 */
		properties: function(node, options) {
			var props = [];
			var ctx = this.context(node, options);

			node.properties().forEach(function(p) {
				if (!injectMixin(p, props, false, options)) {
					p.value = expression.safeEval(p.value, ctx, evalFallback);
					props.push(p);
				}
			});

			return props;
		},

		/**
		 * Builds execution context for given CSS node. This
		 * context contains available variables and functions
		 * that can be used to evaluate expression
		 * @param  {CSSNode} node
		 * @param {Object} vars Additional variables
		 * @return {Object}
		 */
		context: function(node, options) {
			if (!node.__lessVars) {
				node.__lessVars = getVariablesScope(node);
			}

			if (options) {
				return fastCopy(depVars(options), node.__lessVars);
			}

			return node.__lessVars;
		},

		/**
		 * Creates patched value version for given property node. 
		 * Preprocessors can have expressions as their values so
		 * we should not just replace this expression with value
		 * but try to modify this expression so it matches given value.
		 * @param  {CSSNode} node Node to patch
		 * @param  {String} expectedValue Expected node value
		 * @return {String}
		 */
		patch: function(node, expectedValue, context) {
			var actualValue = this.eval(node, context);
			var exprParts = expression.split(node.value());
			var actualParts = expression.split(actualValue);
			var expectedParts = expression.split(expectedValue);

			var state = {
				ctx: context || this.context(node),
				valid: true,
				unsafe: false
			};

			// console.log('patching from "%s" to "%s"', actualValue, expectedValue);

			var out = [];
			expectedParts.forEach(function(expected, i) {
				if (!state.valid) {return;}
				var actual = actualParts[i];
				var expr = exprParts[i];

				if (!actual || !hasSameType(actual, expected)) {
					// it’s a new token or
					// values are of different type, can’t be mutually converted
					return out.push(expected);
				}
				
				if (actual === expected) {
					return out.push(expr);
				}

				if (!expr) {
					// give up: looks like a single expression
					// generated a multi-part value so we can’t 
					// do anything with it
					return state.valid = false;
				}

				try {
					var pe = expressionEval.parse(expr);
					out.push(expression.safeUpdate(state, pe, expected, actual));
				} catch(e) {
					logger.log('Unable to eval ' + expr + ': ' + e);
					return out.push(expected);
				}
			});
			
			return {
				value: state.valid ? out.join(' ') : actualValue,
				safe: !state.unsafe,
				valid: state.valid
			};
		},

		// these methods are for testing mostly
		splitArgs: splitArgs,
		extractMixinGuard: extractMixinGuard
	}
});