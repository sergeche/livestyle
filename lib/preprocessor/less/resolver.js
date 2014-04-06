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
	var extend = require('./extend');
	var variable = require('./variable');
	var mixin = require('./mixin');
	var ResolvedNode = require('../resolvedNode');

	var resolvers = [
		extend,
		mixin,
		variable,
		require('./media-query'),
		require('./section'),
		require('./property'),
	];

	return {
		resolve: function(tree, options) {
			var root = new ResolvedNode(tree);
			root.state = new State({
				parent: root,
				variables: {},
				mixins: {},
				toExtend: [],
				transform: function(node, state) {
					variable.collect(node, state);
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

			// mixins can be defined at root only
			mixin.collect(tree, state);
			root.state.next(tree, root.state);

			extend.postProcess(root, root.state);
			return root;
		}
		// resolve: function(tree, options) {
		// 	context.resolveSelectors(tree, options);
		// 	var list = preprocessor.resolve(tree, {
		// 		nestedInsert: 'after',
		// 		nestingProcessor: function(payload) {
		// 			var sels = payload.parent;
		// 			if (!sels._processed) {
		// 				sels = sels.map(extend.stripExtend);
		// 				sels._processed = true;
		// 				payload.parent = sels;
		// 			}
		// 		}
		// 	});
		// 	list = extend.resolve(list);
		// 	list = this.removeMixins(list);
		// 	return list;
		// },

		
	};
});