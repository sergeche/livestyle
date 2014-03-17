/**
 * SASS nesting resolver: updates paths of given node list so 
 * they contain resolved nested selector.
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
	var selector = require('../selector');
	var range = require('../../../node_modules/emmet/lib/assets/range');
	var stringStream = require('../../../node_modules/emmet/lib/assets/stringStream');
	var utils = require('../../../node_modules/emmet/lib/utils/common');

	var reValidSections = /^@(media|supports)/;
	var reHasRef = /&/;
	var rePropertyStack = /:\s*$/;

	/**
	 * Returns positions of all &-references in given selector
	 * @param {String} sel Selector with references
	 * @return {Array} Array of ranges of references
	 */
	function getReferences(sel) {
		var out = [];
		var stream = stringStream(sel), ch;
		while ((ch = stream.next())) {
			if (ch === '&') {
				out.push(range(stream.pos - 1, 1));
			} else {
				stream.skipQuoted();
			}
		}
		return out;
	}

	/**
	 * Prepends given parent selectors to `sel` selector
	 * @param  {String} sel     Current selectors
	 * @param  {Array} parents List of parent selectors
	 * @return {Array}
	 */
	function prependParent(sel, parents) {
		var out = [];
		for (var i = 0, il = parents.length; i < il; i++) {
			out.push(parents[i] + ' ' + sel);
		}

		return out;
	}

	/**
	 * Create replacement matrix where each row has length of nuber of
	 * &-refences in selector and each cell points to parent selector
	 * @param  {Array} refs   
	 * @param  {Array} parents 
	 * @return {Array}         
	 */
	function createReplacementMatrix(refs, parents) {
		var fill = function(out, row) {
			for (var i = 0, il = parents.length, cur; i < il; i++) {
				cur = row.slice(0);
				cur.unshift(i);
				if (row.length < refs.length) {
					fill(out, cur);
				} else {
					out.push(row);
				}
			}

			return out;
		};

		return fill([], []);
	}

	function mergeResolvedSelectors(resolved) {
		resolved = resolved.map(function(sels) {
			return _.uniq(sels);
		});

		if (resolved.length == 1) {
			return resolved[0];
		}

		var maxSels = +_(resolved).pluck('length').max();
		var out = [];

		for (var i = 0; i < maxSels; i++) {
			for (var j = 0, jl = resolved.length; j < jl; j++) {
				if (resolved[j][i]) {
					out.push(resolved[j][i]);
				}
			}
		}

		return out;
	}

	/**
	 * Resolves nesting for given selectors: adds `parent` selectors
	 * to given `current` ones. In simple cases, parent selectors are prepended to 
	 * current; if current selector contains &-references, they are
	 * properly replaced with parent ones
	 * @param  {Array} current Current section’s selectors
	 * @param  {Array} parent  Parent section’s selectors
	 * @param  {Object} options 
	 * @return {Array}         Plain list of resolved selectors
	 */
	function resolveSelectors(current, parents, options) {
		var resolved = [], processedSels;
		var refs = [];
		for (var i = 0, il = current.length; i < il; i++) {
			refs = getReferences(current[i]);

			// no &-references: simply prepend parent selector
			if (!refs.length) {
				resolved[i] = prependParent(current[i], parents);
				continue;
			}

			var matrix = createReplacementMatrix(refs, parents);
			resolved[i] = [];

			for (var j = 0, jl = matrix.length, row, curSel; j < jl; j++) {
				row = matrix[j];
				curSel = current[i];
				for (var k = row.length - 1; k >= 0; k--) {
					curSel = utils.replaceSubstring(curSel, parents[row[k]], refs[k]);
				}
				resolved[i].push(curSel);
			}
		}

		return mergeResolvedSelectors(resolved);
	}

	return {
		/**
		 * Resolves nesting of sections: each nested section receives
		 * its semi-evaluated CSS selector (e.g. the one that will be in 
		 * in final CSS output)
		 * @param  {Array} list
		 * @return {Array}
		 */
		resolve: function(list, options) {
			options = options || {};
			// this function must be highly optimized for performance
			var out = [];
			var selCache = {};

			var splitSel = function(sel) {
				if (!(sel in selCache)) {
					selCache[sel] = selector.rules(sel);
				}

				return selCache[sel];
			};

			list.forEach(function(item) {
				var sel = [];
				var pathRef = 0;
				var parent = item.path[pathRef++];
				var skip = false;

				if (reValidSections.test(parent)) {
					// do not use selectors like `@media` or `@supports`
					// to resolve name
					sel.push(parent);
					parent = item.path[pathRef++];
				}

				if (!parent) {
					return;
				}

				parent = splitSel(parent);

				var resolved = [], cur;
				while (pathRef < item.path.length) {
					resolved = [];
					if (rePropertyStack.test(item.path[pathRef])) {
						// do not resolve property stacks like 
						// font: { ... }
						skip = true;
						break;
					}

					cur = splitSel(item.path[pathRef++]);

					parent = resolveSelectors(cur, parent, options);
					// console.log(parent.join(', '));
				}

				if (!skip) {
					sel.push(parent.join(', '));
					out.push(_.defaults({path: sel}, item));
				}
			});

			return out;
		}
	};
});