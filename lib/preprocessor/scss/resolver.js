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
	var _ = require('lodash');
	var ResolvedNode = require('../resolvedNode');

	var extend = require('./extend');
	var mixin = require('./mixin');
	var expression = require('./expression');
	var property = require('./property');
	var propertySet = require('./property-set');
	var section = require('./section');
	var mq = require('./media-query');
	var atRoot = require('./at-root');
	var $if = require('./if');
	var $for = require('./for');
	var $while = require('./while');
	var $each = require('./each');

	var reIsVar = /^\$/;

	function isVariable(node) {
		return reIsVar.test(node.name());
	}

	function transform(node, state) {
		if (isVariable(node)) {
			return state.variables[node.name()] = expression.eval(node.value(), state.variables, true);
		}

		if (extend.resolve(node, state)) return;
		if (mixin.resolve(node, state)) return;
		if (propertySet.resolve(node, state)) return;
		if (propertySet.resolve(node, state)) return;
		if (mq.resolve(node, state)) return;
		if (atRoot.resolve(node, state)) return;
		if ($if.resolve(node, state)) return;
		if ($for.resolve(node, state)) return;
		if ($while.resolve(node, state)) return;
		if ($each.resolve(node, state)) return;
		if (section.resolve(node, state)) return;
		if (property.resolve(node, state)) return;
		
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