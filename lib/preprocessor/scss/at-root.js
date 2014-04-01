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
	var nesting = require('./nesting');
	var ResolvedNode = require('../resolvedNode');

	var reIsAtRoot = /^@at\-root\b/;

	/**
	 * Parses `@at-root` definition
	 * @param  {String} dfn
	 * @return {Object}
	 */
	function parseAtRoot(dfn) {
		var out = {};
		dfn = dfn.replace(reIsAtRoot, '').trim();

		// parse with/without
		dfn = dfn.replace(/\(\s*(with|without)\s*:\s*(.+?)\)/, function(str, name, value) {
			out[name] = value.trim();
			return '';
		});

		out.name = dfn.trim();
		return out;
	}

	function findInsertionPoint(dfn, node) {
		var reSectionName = /^@(\w+)/;
		if (dfn['without']) {
			if (dfn['without'] == 'all') {
				return node.root;
			}

			while (node.parent) {
				var m = node.name.match(reSectionName);
				if (!m) {
					break;
				}

				if (~dfn['without'].indexOf(m[1])) {
					node = node.parent.top();
				} else {
					break;
				}
			}
			return node;
		}

		if (dfn['with'] === 'rule') {
			return node.root();
		}

		return node;
	}

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

			var top = state.parent.top();
			var root = top.root();
			var atRoot = parseAtRoot(node.name());
			if (atRoot.name) {
				// prefixed selector: @at-root .something { ... }
				section.resolve(node, _.defaults({parent: top}, state), atRoot.name);
				return true;
			}

			// section form: @at-root { ... }
			// may also contain with/without instructions
			top = findInsertionPoint(atRoot, top);
			var originalParent = state.parent;
			var anonParent = new ResolvedNode(node.parent);

			var anonState = _.defaults({parent: anonParent}, state);
			state = _.defaults({parent: top}, state);
			node.children.forEach(function(child) {
				if (child.type == 'property') {
					if (!anonParent.parent) {
						top.addChild(anonParent);
					}
					state.transform(child, anonState);
				} else if (atRoot['with'] === 'rule') {
					var path = [originalParent.name, child.name()];
					section.resolve(child, _.defaults({parent: root}, state), nesting.resolvedNameForPath(path));
				} else {
					section.resolve(child, state);
				}
			});

			return true;
		}
	};
});