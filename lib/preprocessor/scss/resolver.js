/**
 * SCSS selector resolver: takes parsed section tree of SCSS selectors 
 * and produces new tree with resolved CSS selectors
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var ResolvedNode = require('../resolvedNode');
	var expression = require('./expression');
	var extend = require('./extend');

	var resolvers = [
		{
			resolve: function(node, state) {
				if (/^\$/.test(node.name())) {
					var ctx = state.variables;
					ctx[node.name()] = expression.eval(node.value(), ctx, true);
					return true;
				}
			}
		},
		extend,
		require('./mixin'),
		require('./property-set'),
		require('./media-query'),
		require('./at-root'),
		require('./if'),
		require('./for'),
		require('./while'),
		require('./each'),
		require('./section'),
		require('./property'),
	];

	function transform(node, state) {
		for (var i = 0, il = resolvers.length; i < il; i++) {
			if (resolvers[i].resolve(node, state)) {
				return;
			}
		}
	};

	return {
		resolve: function(tree, options) {
			var root = new ResolvedNode(tree);
			root.state = {
				parent: root,
				variables: {},
				mixins: {},
				toExtend: [],
				transform: transform
			};

			tree.children.forEach(function(node) {
				transform(node, root.state);
			});

			extend.postProcess(root, root.state);
			return root;
		}
	};
});