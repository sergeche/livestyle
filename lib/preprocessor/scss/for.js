/**
 * `@for` loop resolver for SCSS
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

	var reFor = /^@for\s+(\$\w+)\s+from\s+(.+?)\s+(through|to)\s+(.+)$/;

	return {
		resolve: function(node, state) {
			var m = node.name().match(reFor);
			if (!m) {
				return false;
			}

			var inc, start, end;
			try {
				inc = m[1];
				start = parseFloat(expression.eval(m[2], state.variables));
				end = parseFloat(expression.eval(m[4], state.variables));
			} catch(e) {
				logger.error('Unable eval to @for conditions: ' + e);
				return true;
			}

			if (_.isNaN(start)) {
				logger.error('Start condition in @for loop is not a number');
				return true;
			}

			if (_.isNaN(end)) {
				logger.error('Start condition in @for loop is not a number');
				return true;
			}

			var innerVars = Object.create(state.variables);
			var innerState = _.defaults({variables: innerVars}, state);
			var fn = function(child) {
				innerState.transform(child, innerState);
			};

			while (m[3] == 'to' ? start < end : start <= end) {
				innerVars[inc] = start;
				node.children.forEach(fn);
				start++;
			}

			return true;
		}
	};
});