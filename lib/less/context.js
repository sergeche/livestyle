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
	var functions = require('./functions');

	function variableValue(val) {
		var parts = expression.split(val);
		return parts.length == 1 ? val : parts;
	}

	return {
		/**
		 * Evaluates value in given CSS node
		 * @param  {CSSNode} node
		 * @return {String}
		 */
		eval: function(node) {
			var value = node.value();
			// value = expression.eval(value, this.context(node));
			try {
				value = expression.eval(value, this.context(node));
			} catch(e) {
				if (e.message != 'function returned null') {
					throw e;
				}
			}
			return value;
		},

		/**
		 * Builds execution context for given CSS node. This
		 * context contains available variables and functions
		 * that can be used to evaluate expression
		 * @param  {CSSNode} node
		 * @return {Object}
		 */
		context: function(node) {
			var ctx = {};
			// collect variables.
			// in LESS, variables are scoped and lazy-loaded,
			// e.g. the last variable instance takes precedence 
			while (node.parent) {
				node.parent.properties().reverse().forEach(function(item) {
					if (item.name.charAt(0) == '@' && !(item.name in ctx)) {
						ctx[item.name] = variableValue(item.value);
					}
				});
				node = node.parent;
			}

			var varKeys = Object.keys(ctx);
			ctx = _.extend(ctx, functions);

			// evaluate each variable since it may contain other variable references
			varKeys.forEach(function(k) {
				try {
					ctx[k] = expression.eval(ctx[k]);
				} catch(e) {}
			});

			return ctx;
		}
	}
});