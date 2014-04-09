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
	var selector = require('../selector');
	var range = require('emmet/lib/assets/range');
	var stringStream = require('emmet/lib/assets/stringStream');
	var utils = require('emmet/lib/utils/common');

	/**
	 * Returns positions of all &-references in given selector
	 * @param {String} sel Selector with references
	 * @return {Array} Array of ranges of references
	 */
	function getReferences(sel) {
		var out = [];
		if (sel.indexOf('&') === -1) {
			return out;
		}

		var stream = stringStream(sel), ch;
		while ((ch = stream.next())) {
			if (ch === '&') {
				out.push(range(stream.pos - 1, 1))
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
	 * Builds replacement matrix: an array containing
	 * array of indexes of parent selectors that should be
	 * substituted instead of &-references
	 * @param  {Number} refs Number of &-references
	 * @param  {Number} parents Number of parent selectors
	 * @return {Array}
	 */
	function createReplacementMatrix(refs, parents) {
		var total = Math.pow(parents, refs);
		var out = [];
		
		var row = [];
		for (var i = 0; i < refs; i++) {
			row[i] = 0;
		}

		for (var i = 0, ix; i < total; i++) {
			out.push(row.slice(0));
			ix = row.length - 1;

			// incrementally update indexes of row
			while (ix >= 0) {
				row[ix] = (row[ix] + 1)  % parents;
				if (row[ix] || !ix) {
					break;
				}
				ix--;
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
	 * @param  {Array} parents  Parent section’s selectors
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
				resolved.push(prependParent(current[i], parents));
				continue;
			}

			var matrix = createReplacementMatrix(refs.length, parents.length);

			for (var j = 0, jl = matrix.length, row, curSel; j < jl; j++) {
				row = matrix[j];
				curSel = current[i];
				for (var k = row.length - 1; k >= 0; k--) {
					curSel = utils.replaceSubstring(curSel, parents[row[k]], refs[k]);
				}
				resolved.push(curSel);
			}
		}

		return resolved;
	}

	return {
		nameForPath: function(path) {
			var pathRef = 0, cur;
			var parent = selector.rules(path[pathRef++]);

			while (pathRef < path.length) {
				cur = selector.rules(path[pathRef++]);
				parent = resolveSelectors(cur, parent);
			}

			return parent.join(', ');
		}
	};
});