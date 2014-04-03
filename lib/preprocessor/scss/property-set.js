/**
 * A property set resolver for SCSS, things like:
 * font: {
 * 	family: Arial;
 * 	size: 10px;
 * }
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var expression = require('./expression');
	var property = require('./property');

	var reIsPset = /:$/;
	return {
		resolve: function(node, state) {
			if (node.type !== 'section' || !reIsPset.test(node.name())) {
				return false;
			}

			var prefix = node.name().replace(/\s*:$/, '-');
			prefix = expression.interpolate(prefix, state.variables);
			node.children.forEach(function(child) {
				if (child.type == 'property') {
					var resolved = property.resolve(child, state);
					resolved.name = prefix + resolved.name;
				}
			});
			return true;
		}
	};
});