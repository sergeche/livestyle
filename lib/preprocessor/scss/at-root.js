/**
 * Resolves `@at-root` sections
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var section = require('./section');

	var reIsAtRoot = /^@at\-root/;

	return {
		/**
		 * `@at-root` section resolver.
		 * @param  {CSSNode} node  Parsed CSS node
		 * @param  {Object} state SCSS resolver state
		 * @return {Boolean}       Returns `true` if given node can be
		 * resolved, `false` otherwise for passing node to another resolver
		 */
		resolve: function(node, state) {
			if (!reIsAtRoot.test(node.name())) {
				return false;
			}

			state = _.defaults({parent: state.parent.top()}, state);

			var nodeName = node.name().replace(reIsAtRoot, '').trim();
			if (nodeName) {
				// prefixed selector: @at-root .something { ... }
				section.resolve(node, state, nodeName);
			} else {
				// section form: @at-root { ... }
				node.children.forEach(function() {
					section.resolve(node, state);
				});
			}

			return true;
		}
	};
});