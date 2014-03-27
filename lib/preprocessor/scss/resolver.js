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
	var nesting = require('./nesting');
	var extend = require('./extend');
	var mixin = require('./mixin');
	var expression = require('./expression');

	var reIsMixin = /^@mixin/;
	var reIsInclude = /^@include/;
	var reIsVar = /^\$/;

	var resolvedNodeLookup = {};

	function ResolvedNode(ref) {
		this.ref = ref;
		this.type = ref.type;
		this.name = null;
		this.value = null;
		this.parent = null;
		this.children = [];

		resolvedNodeLookup[ref.id] = this;
	}

	ResolvedNode.prototype = {
		addChild: function(child) {
			if (!(child instanceof ResolvedNode)) {
				child = new ResolvedNode(child);
			}
			child.parent = this;
			this.children.push(child);
			return child;
		},

		root: function() {
			var node = this;
			while (node.parent) {
				node = node.parent;
			}

			return node;
		}
	};

	function isPropertySet(node) {
		return node.type == 'section' && /:$/.test(node.name());
	}

	function isInclude(node) {
		return reIsInclude.test(node.name());
	}

	function isMixin(node) {
		return reIxMixin.test(node.name());
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
	function resolveProperty(node, ctx, prefix) {
		prefix = prefix || '';
		var out = new ResolvedNode(node);
		out.name = prefix + expression.interpolate(node.name(), ctx);
		out.value = expression.eval(node.value(), ctx, true);
		return out;
	}

	/**
	 * Resolves `@include` node
	 * @param  {CSSNode} node  `@include` node
	 * @param  {Object} state Current resolver state
	 */
	function resolveMixinInclude(node, state) {
		var mx = mixin.mixinForInclude(node, state.mixins);
		if (!mx) {
			return;
		}

		// create local variables context for current mixin
		var localState = _.extend({}, state, {
			variables: _.extend(Object.create(state.variables), mx.context)
		});

		mx.node.children.forEach(function(child) {
			transform(child, localState);
		});
	}

	function pathForNode(node, ctx) {
		var path = [], name;
		var reSkip = /^@/;
		while (node.parent) {
			name = node.name();
			if (reSkip.test(name)) {
				break;
			}

			// do we have cached node?
			if (node.id in resolvedNodeLookup) {
				path.push(resolvedNodeLookup[node.id].name);
				break;
			}

			path.push(expression.interpolate(name, ctx));
		}
	}

	function resolveSection(node, state) {
		var out = new ResolvedNode(node);
		out.name = nesting.resolvedNameForNode(node, pathForNode(node));

		// sections must be added on top level, except media queries
		// TODO add media query support
		state.parent.root().addChild(out);
		node.children.forEach(function(child) {
			transform(child, state);
		});
	}

	function transform(node, state) {
		if (isVariable(node)) {
			return state.variables[node.name()] = node.value();
		}

		if (isMixin(node)) {
			var mx = mixin.parse(node);
			return state.mixins[mx.name] = mx;
		}

		if (isPropertySet(node)) {
			var prefix = item.name().replace(/\s*:$/, '-');
			prefix = expression.interpolate(prefix, state.variables);
			return node.children.forEach(function(child) {
				if (child.type == 'property') {
					parent.addChild(resolveProperty(child, state.variables, prefix));
				}
			});
		}

		if (isInclude(node)) {
			return resolveMixinInclude(node, state);
		}

		if (node.type == 'property') {
			return parent.addChild(resolveProperty(node, state.variables));
		}









		var pathPrefix = state.prefix || [];
		var out = [], mixin;

		for (var i = 0, il = list.length, item, path, name; i < il; i++) {
			item = list[i];
			if (reMixin.test(item.name())) {
				continue;
			}

			if (item.type == 'section' && !isPropertySet(item)) {
				path = pathPrefix.slice(0);
				path.push(item.name());
				out.push({
					path: path,
					node: item
				});
				out = out.concat( walk(item.children, {prefix: path}) );
			} else if (isInclude(item)) {
				mixin = mixinForInclude(item);
				if (mixin) {
					out = out.concat( walk(mixin.children, {prefix: pathPrefix}) );
				}
			}
		}

		return out;
	};

	return {
		resolve: function(tree, options) {
			options = options || {};

			var list = preprocessor.toList(tree);
			list = mq.resolve(list, options);
			list = nesting.resolve(list, options);
			list = extend.resolve(list, options);
			return list;
		},

		/**
		 * Returns list of properties for given node, including ones 
		 * resolved from mixins
		 * @return {Array} List of properties, including references to their origin nodes
		 */
		properties: function(node, options) {
			options = options || {};
			var props = [];
			var prefix = options.prefix || '';

			node.children.forEach(function(item) {
				if (item.type == 'property') {
					props.push({
						name: prefix + item.name(),
						value: item.value(),
						node: item
					});
				} else if (isPropertySet(item)) {
					// nested property set:
					// border: {
					//     width: 1px;
					//     color: red;
					// }
					var p = item.name().replace(/\s*:$/, '-');
					props = props.concat(this.properties(item, {prefix: p}));
				} else if (isInclude(item)) {
					var mx = mixin.mixinForInclude(item);
					if (mx) {
						props = props.concat(this.properties(mx));
					}
				}
			}, this);

			return props;
		}
	};
});