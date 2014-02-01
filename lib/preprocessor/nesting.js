/**
 * Common nesting resolver for preprocessors: updates paths of
 * of given node list so they contain resolved nested selector.
 *
 * All `&` tokens in selectors will be replaced with parent selectors
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var range = require('../../node_modules/emmet/lib/assets/range');
	var stringStream = require('../../node_modules/emmet/lib/assets/stringStream');

	var reValidSections = /^@(media|supports)/;
	var reHasRef = /&/;
	var rePropertyStack = /:\s*$/;

	function copy(target, source) {
		for (var p in source) if (source.hasOwnProperty(p)) {
			if (!(p in target)) {
				target[p] = source[p];
			}
		}

		return target;
	}

	return {
		/**
		 * Resolves nesting of sections: each nested section receives
		 * its semi-evaluated CSS selector (e.g. the one that will be in 
		 * in final CSS output)
		 * @param  {Array} list
		 * @return {Array}
		 */
		resolve: function(list) {
			// this function must be highly optimized for performance
			var out = [];
			var selCache = {};

			var splitSel = function(sel) {
				if (!(sel in selCache)) {
					selCache[sel] = selector.rules(sel);
				}

				return selCache[sel];
			};

			var sel, parent, resolved, cur, pathRef, skip;
			for (var k = 0, kl = list.length, item; k < kl; k++) {
				item = list[k];
				sel = [];
				pathRef = 0;
				parent = item.path[pathRef++];

				if (reValidSections.test(parent)) {
					// do not use selectors like `@media` or `@supports`
					// to resolve name
					sel.push(parent);
					parent = item.path[pathRef++];
				}

				if (!parent) {
					continue;
				}

				parent = splitSel(parent);
				skip = false;

				while (pathRef < item.path.length) {
					resolved = [];
					if (rePropertyStack.test(item.path[pathRef])) {
						// do not resolve property stacks like 
						// font: { ... }
						skip = true;
						break;
					}

					cur = splitSel(item.path[pathRef++]);

					for (var i = 0, il = cur.length; i < il; i++) {
						for (var j = 0, jl = parent.length; j < jl; j++) {
							resolved.push(joinSelectors(parent[j], cur[i]));
						}
					}

					parent = resolved;
				}

				if (!skip) {
					sel.push(parent.join(', '));
					out.push(copy({path: sel}, item));
				}
			}

			return out;
		},

		/**
		 * Returns positions of all &-references in given selector
		 * @param {String} sel Selector with references
		 * @return {Array} Array of ranges of references
		 */
		getReferences: function(sel) {
			var out = [];
			var stream = stringStream(sel), ch;
			while ((ch = stream.next())) {
				if (ch === '&') {
					out.push(range(stream.pos, 1))
				} else {
					stream.skipQuoted();
				}
			}
		},

		/**
		 * Replaces &-reference in selector with parent selector
		 * @param  {String} sel    Child selector with possible &-reference
		 * @param  {String} parent Parent selector to put instead of &-reference
		 * @return {String}        If reference wasn’t found, returns `sel` as-is
		 */
		replaceReference: function(parent, child) {
			var stream = stringStream(child);
			var out = '', ch;
			while ((ch = stream.next())) {
				if (ch === '&') {
					out += parent;
				} else if (ch === '"' || ch === "'") {
					stream.start = stream.pos - 1;
					stream.skipString(ch);
					out += stream.current();
				} else {
					out += ch;
				}
			}

			return out;
		},

		joinSelectors: function(parent, child) {
			if (!reHasRef.test(child)) {
				return parent + ' ' + child;
			}

			var resolved = this.replaceReference(parent, child);
			if (resolved === child) {
				// no &-reference found, concat two selectors with space
				resolved = parent + ' ' + child;
			}

			return resolved;
		}
	};
});