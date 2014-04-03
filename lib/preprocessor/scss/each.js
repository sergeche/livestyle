/**
 * `@each` resolver for SCSS
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var expression = require('./expression');
	var logger = require('../../logger');

	var reEach = /^@each\s+(.+?)\s*in\s*(.+)$/;
	var reIsVar = /^\$/;

	/**
	 * Parses variables list from `@each` section.
	 * Basically, just splits a list of variable names
	 * @param  {String} str String to parse
	 * @return {Array}
	 */
	function parseVars(str) {
		var list = expression.parse(str);
		return Array.isArray(list) ? list : [list];
	}

	/**
	 * Evaluates expressions in given argument
	 * @param  {Object} arg  Argument to evaluate
	 * @param  {Object} state Current variables context
	 */
	function evalExpression(arg, ctx) {
		if (Array.isArray(arg)) {
			return arg.map(function(a) {
				return evalExpression(a, ctx);
			});
		}

		if (typeof arg == 'object') {
			var out = {};
			_.each(arg, function(v, k) {
				out[expression.interpolate(k, ctx)] = evalExpression(v, ctx);
			});
			return out;
		}

		return expression.eval(arg, ctx, true);
	}

	function eachOnMap(vars, args, node, state) {
		_.each(args, function(v, k) {
			if (vars.length == 1) {
				state.variables[vars[0]] = k + ' ' + v;
			} else {
				state.variables[vars[0]] = k;
				state.variables[vars[1]] = v;
			}

			node.children.forEach(function(child) {
				state.transform(child, state);
			});
		})
	}

	function eachOnList(vars, args, node, state) {
		_.each(args, function(v) {
			if (!Array.isArray(v)) {
				v = [v];
			}

			for (var i = 0, il = vars.length; i < il; i++) {
				state.variables[vars[i]] = v[i] || '';
			}

			node.children.forEach(function(child) {
				state.transform(child, state);
			});
		})
	}

	/**
	 * Parses `@each` argument. Right now we support only 
	 * simple and most common pattern: either map/list or variable reference.
	 * More complex examples like functions that generate or transform
	 * lists are not supported
	 * @param  {String} str String to parse
	 * @param  {Object} Current transformation state
	 * @return {Array|Object}
	 */
	function parseArgument(str, state) {
		var list = expression.parse(str);
		if (typeof list == 'string' && reIsVar.test(list)) {
			// it’s a variable reference: get it from current
			// scope and try to parse as list
			list = state.variables[list];
			if (!list) {
				logger.error('Unable to resolve expression for @each section: ' + list);
				return [];
			}
			list = expression.parse(list);
		}

		if (typeof list !== 'object') {
			list = [list];
		}

		return evalExpression(list, state.variables);
	}

	return {
		resolve: function(node, state) {
			var m = node.name().match(reEach);
			if (!m) {
				return false;
			}

			var vars = parseVars(m[1]);
			var args = parseArgument(m[2], state);

			var localVariables = Object.create(state.variables);
			var localState = _.defaults({variables: localVariables}, state);

			if (Array.isArray(args)) {
				eachOnList(vars, args, node, localState);
			} else {
				eachOnMap(vars, args, node, localState);
			}

			return true;
		}
	};
});