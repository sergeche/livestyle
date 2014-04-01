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
	var preprocessor = require('../resolver');
	var mq = require('../media-query');
	var ResolvedNode = require('../resolvedNode');
	var selector = require('../selector');

	var extend = require('./extend');
	var mixin = require('./mixin');
	var expression = require('./expression');
	var section = require('./section');
	var atRoot = require('./at-root');
	var $if = require('./if');
	var $for = require('./for');
	var $while = require('./while');

	var reIsMixin = /^@mixin/;
	var reIsInclude = /^@include/;
	var reIsVar = /^\$/;

	function isPropertySet(node) {
		return node.type == 'section' && /:$/.test(node.name());
	}

	function isInclude(node) {
		return reIsInclude.test(node.name());
	}

	function isMixin(node) {
		return reIsMixin.test(node.name());
	}

	function isVariable(node) {
		return reIsVar.test(node.name());
	}

	/**
	 * Resolves property node
	 * @param  {CSSNode} node
	 * @param  {String} prefix
	 * @return {ResolvedNode}
	 */
	function resolveProperty(node, state) {
		var ctx = state.variables;
		var out = new ResolvedNode(node);
		out.name = expression.interpolate(node.name(), ctx);
		out.value = expression.eval(node.value(), ctx, true);
		state.parent.addChild(out);
		return out;
	}

	function resolvePropertySet(node, state) {
		var prefix = node.name().replace(/\s*:$/, '-');
		prefix = expression.interpolate(prefix, state.variables);
		node.children.forEach(function(child) {
			if (child.type == 'property') {
				var resolved = resolveProperty(child, state);
				resolved.name = prefix + resolved.name;
			}
		});
	}

	/**
	 * Resolves `@include` node
	 * @param  {CSSNode} node  `@include` node
	 * @param  {Object} state Current resolver state
	 */
	function resolveInclude(node, state) {
		var mx = mixin.mixinForInclude(node, state.mixins);
		if (!mx) {
			return;
		}

		// create local variables context for current mixin
		var localVars = Object.create(state.variables), allArgs = [];
		_.each(mx.context, function(value, name) {
			if (value) {
				value = expression.eval(value, state.variables, true);
			}
			localVars[name] = value;
			allArgs.push({
				name: name,
				value: value
			});
		});

		localVars.$args = allArgs;

		var localState = _.defaults({
			variables: localVars,
			mixinContent: mx.content
		}, state);

		mx.node.children.forEach(function(child) {
			state.transform(child, localState);
		});
	}

	function resolveMixinContent(node, state) {
		if (!state.mixinContent) {
			return;
		}

		state.mixinContent.forEach(function(child) {
			state.transform(child, state);
		});
	}

	function transform(node, state) {
		// console.log('node: "%s" (%s)', node.name(), node.type);
		if (isVariable(node)) {
			return state.variables[node.name()] = expression.eval(node.value(), state.variables, true);
		}

		if (isMixin(node)) {
			var mx = mixin.parse(node);
			return state.mixins[mx.name] = mx;
		}

		if (isPropertySet(node)) {
			return resolvePropertySet(node, state);
		}

		if (isInclude(node)) {
			return resolveInclude(node, state);
		}

		if (node.name() == '@content') {
			return resolveMixinContent(node, state);
		}

		if (node.name() == '@extend') {
			return extend.save(node, state);
		}

		if (atRoot.resolve(node, state)) return;
		if ($if.resolve(node, state)) return;
		if ($for.resolve(node, state)) return;
		if ($while.resolve(node, state)) return;

		if (node.type == 'property') {
			return resolveProperty(node, state);
		}

		if (section.resolve(node, state)) return;
		
	};

	return {
		// resolve: function(tree, options) {
		// 	options = options || {};

		// 	var list = preprocessor.toList(tree);
		// 	list = mq.resolve(list, options);
		// 	list = nesting.resolve(list, options);
		// 	list = extend.resolve(list, options);
		// 	return list;
		// },

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

			extend.resolve(root.state.toExtend);
			extend.removeExtendOnly(root);

			return root;
		}
	};
});