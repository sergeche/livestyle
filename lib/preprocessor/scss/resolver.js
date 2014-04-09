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
	var State = require('../state');
	var expression = require('./expression');
	var extend = require('./extend');
	var tree = require('../../tree');

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

	return {
		resolve: function(source, options) {
			if (typeof source == 'string') {
				source = tree.build(source);
			}
			
			var root = new ResolvedNode(source);
			root.state = new State({
				parent: root,
				variables: {},
				mixins: {},
				toExtend: [],
				transform: function(node, state) {
					for (var i = 0, il = resolvers.length; i < il; i++) {
						if (resolvers[i].resolve(node, state)) {
							break;
						}
					}
					return this;
				},
				next: function(node, state, fn) {
					fn = fn || this.transform;
					node.children.forEach(function(child) {
						fn.call(this, child, state);
					});
					return this;
				}
			});
			
			root.state.next(source, root.state);

			extend.postProcess(root, root.state);
			return root;
		}
	};
});