/**
 * Library for working with expression evaluation in SCSS
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var expression = require('../../expression');
	var stringStream = require('emmet/lib/assets/stringStream');
	var range = require('emmet/lib/assets/range');
	var utils = require('emmet/lib/utils/common');

	var reStructSep = /[\s,\(]/;
	var reOps = /[\-\+\*\/=\!<>]/;

	function unquote(str) {
		return str.replace(/^["']|["']$/g, '');
	}

	return {
		/**
		 * Interpolates #{...} fragments in given string.
		 * @param  {String} str     String to interpolate
		 * @param  {Object} ctx     Evaluation context. Can be a function
		 * which will be evaluated only during interpolation 
		 * (lazy context propagation)
		 * @param  {Object} options Additional options
		 * @return {String}
		 */
		interpolate: function(str, ctx, options) {
			var tokens = this.findTokens(str);
			if (!tokens.length) {
				// nothing to evaluate
				return str;
			}

			tokens.reverse();
			if (typeof ctx == 'function') {
				ctx = ctx();
			}

			tokens.forEach(function(token) {
				var expr = str.substring(token.start + 2, token.end - 1);
				var result = expression.eval(expr, ctx, true);
				str = utils.replaceSubstring(str, unquote(result), token);
			});

			return str;
		},

		/**
		 * Parses given expression: transforms it into a list and/or map
		 * @param  {String} expr Expression to parse
		 * @return {Object}      Parsed result: array or object (hash)
		 */
		parse: function(expr) {
			expr = expr.trim();

			if (!reStructSep.test(expr)) {
				return [expr];
			}

			// normalize spaces
			expr = expr.replace(/\s+/g, ' ');

			var parent = [], ctx = [], innerExpr;
			var stream = stringStream(expr), ch;

			var save = function(backup) {
				var val = stream.current(backup).trim();
				if (val) {
					ctx.push(val);
				}
				stream.start = stream.pos;
			};

			var switchCtx = function() {
				if (ctx.length) {
					parent.push(ctx.length === 1 ? ctx[0] : ctx);
				}
				ctx = [];
			};

			// list examples:
			// 1 2 3 -> [1, 2, 3]
			// 1 2, 3 4 -> [[1, 2], [3, 4]]
			// 1, 2 3, 4 -> [[1], [2, 3], [4]]

			while (ch = stream.next()) {
				if (ch == ' ') {
					// found space, it could be a part separator or
					// just an expression formatting
					if (reOps.test(stream.peek())) {
						// found operator: it’s a formatting
						while (reOps.test( stream.peek() )) {
							stream.next();
						}

						stream.eatSpace();
					} else {
						// it’s a part separator
						if (ctx.sep === ',') {
							switchCtx();
						}

						save(true);
						ctx.sep = ' ';
					}
				} else if (ch == ',') {
					// explicit list item separator
					if (ctx.sep !== ' ') {
						ctx.sep = ',';
					}
					save(true);
					switchCtx();
					stream.eatSpace();
				} else if (ch == '(') {
					stream.start = stream.pos;
					stream.backUp(1);
					if (stream.skipToPair('(', ')', true)) {
						innerExpr = stream.current(true);
						ctx.push(this.parseMap(innerExpr) || this.parse(innerExpr));
					} else {
						throw new Error('Missing closing brace for opening one at pos:' + stream.pos + ' in "' + expr + '"');
					}
					stream.start = stream.pos;
				} else {
					stream.skipQuoted();
				}
			}

			save();
			switchCtx();
			return parent.length === 1 ? parent[0] : parent;
		},

		parseMap: function(expr) {
			var out, key = null, value = null;
			var stream = stringStream(expr.trim()), ch;

			var save = function() {
				if (key && value !== null) {
					if (!out) {
						out = {};
					}
					out[key] = value;
				}

				key = value = null;
				stream.start = stream.pos;
			};

			while (ch = stream.next()) {
				if (ch === ':') {
					key = stream.current(true).trim();
					value = null;
					stream.start = stream.pos;
				} else if (ch === ',') {
					value = stream.current(true).trim();
					save();
				} else if (ch == '(') {
					stream.backUp(1);
					stream.start = stream.pos;
					if (stream.skipToPair('(', ')', true)) {
						value = this.parse(stream.current());
						save();
					} else {
						throw new Error('Missing closing brace for opening one at pos:' + stream.pos + ' in "' + expr + '"');
					}
					stream.start = stream.pos;
				} else {
					stream.skipQuoted();
				}
			}

			value = stream.current().trim();
			save();
			return out;
		},

		/**
		 * Evaluates given expression with passed variables context
		 * @param  {String} expr Expression to evaluate
		 * @param  {Object} ctx  Variables context
		 * @param  {Boolean} safe Use safe evaluation (e.g. do not throw exception
		 * if expressoin cannot be evaluated, return original expression instead)
		 * @return {String}      Result of expression evaluation
		 */
		eval: function(expr, ctx, safe) {
			return expression.eval(expr, ctx, safe);
		},

		/**
		 * Finds all interpolation tokens in given string
		 * @param  {String} str
		 * @return {Array} List of token ranges
		 */
		findTokens: function(str) {
			var tokens = [];
			var stream = stringStream(str), ch;
			while (ch = stream.next()) {
				if (ch == '#' && stream.peek() == '{') {
					stream.start = stream.pos - 1;
					if (!stream.skipToPair('{', '}', true)) {
						// invalid interpolation fragment in string
						return [];
					}
					tokens.push(range.create2(stream.start, stream.pos));
				}
			}

			return tokens;
		}
	};
});