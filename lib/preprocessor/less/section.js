/**
 * A generic section (CSS rule) resolver: interpolates rule name
 * and resolves nested rules
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var expression = require('./expression');
	var nesting = require('./nesting');
	var ResolvedNode = require('../resolvedNode');

	return {
		/**
		 * Section resolver
		 * @param  {CSSNode} node  Parsed CSS node
		 * @param  {Object} state SCSS resolver state
		 * @return {Boolean}       Returns `true` if given node can be
		 * resolved, `false` otherwise for passing node to another resolver
		 */
		resolve: function(node, state, nodeName) {
			if (node.type !== 'section') {
				return false;
			}

			var out = new ResolvedNode(node, state);
			var path = [];
			if (state.parent.name && !/^@media|@supports/.test(state.parent.name)) {
				path.push(state.parent.name);
			}

			nodeName = nodeName || node.name();
			path.push(expression.interpolate(nodeName, state.variables));

			out.name = nesting.nameForPath(path);

			// sections must be added on top level, except media queries
			state.parent.top().addChild(out);
			return state.next(node, state.clone({parent: out}));
		}
	}
});