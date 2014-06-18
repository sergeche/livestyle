/**
 * LESS selector resolver: takes parsed section tree of LESS selectors 
 * and produces new tree with resolved CSS selectors
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var tree = require('../../tree');
	var ResolvedNode = require('../resolvedNode');
	var extend = require('./extend');
	var variable = require('./variable');
	var mixin = require('./mixin');
	var State = require('../state');

	var resolvers = [
		mixin,
		require('./media-query'),
		variable,
		require('./section'),
		require('./property')
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
					variable.collect(node, state);
					mixin.collect(node, state);
					state = state.clone({
						variables: {},
						mixins: {}
					});
					node.children.forEach(function(child) {
						fn.call(this, child, state);
					});
					return this;
				}
			});

			// mixins can be defined at root only
			// mixin.collect(source, root.state);
			root.state.next(source, root.state);
			// console.log('mixins', root.state.mixins);

			extend.resolve(root, root.state);
			return root;
		}
	};
});