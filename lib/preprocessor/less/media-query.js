/**
 * Media query resolver for SCSS
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var expression = require('./expression');
	var ResolvedNode = require('../resolvedNode');

	var reMedia = /@media\s*/i;

	/**
	 * Evaluates media query
	 * @param  {String} query 
	 * @param  {Object} state
	 * @return {String}
	 */
	function evalQuery(query, state) {
		return expression.interpolate(query, state.variables)
			.replace(/\@[\w\-]+/g, function(v) {
				return state.variables[v] || '';
			})
			.trim();
	}

	return {
		resolve: function(node, state) {
			if (!reMedia.test(node.name())) {
				return false;
			}

			var parts = [evalQuery(node.name().replace(reMedia, ''), state)];
			// media queries can be nested: walk up the tree
			// and collect parent queries
			var n = node.parent, parentName;
			while (n) {
				parentName = n.name();
				if (reMedia.test(parentName)) {
					parts.unshift(parentName.replace(reMedia, ''));
				}
				n = n.parent;
			}

			var mq = new ResolvedNode(node);
			mq.name = '@media ' + parts.join(' and ');
			state.parent.root().addChild(mq);

			// find best insertion target which is not media query
			var target = state.parent;
			while (target && target.name) {
				if (!reMedia.test(target.name)) {
					break;
				}
			}

			if (target) {
				target = target.clone();
				mq.addChild(target);
			} else {
				target = mq;
			}

			return state.next(node, state.clone({parent: target}));
		}
	};
});