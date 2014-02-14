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
	var selector = require('./selector');
	var range = require('../../node_modules/emmet/lib/assets/range');
	var stringStream = require('../../node_modules/emmet/lib/assets/stringStream');
	var utils = require('../../node_modules/emmet/lib/utils/common');

	var reValidSections = /^@(media|supports)/;
	var reHasRef = /&/;
	var rePropertyStack = /:\s*$/;

	function resolveSelectors(current, parent, options) {
		var resolved = [];
		for (var i = 0, il = current.length, payload; i < il; i++) {
			payload = {
				cur: current[i],
				parent: parent
			};

			if (options.nestingProcessor) {
				options.nestingProcessor(payload);
			}

			processedSels = this.replaceReferences(payload.cur, payload.parent)
				|| this.prependParent(payload.cur, payload.parent);
			resolved = resolved.concat(processedSels);
		}

		parent = resolved;
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

			var sel, parent, resolved, processedSels, cur, pathRef, skip;
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

					// XXX: for deeply nested sections resolving is performed
					// multiple times, e.g. intermediate selectors resolved 
					// multiple times but it’s not required.
					// Should fix that.

					cur = splitSel(item.path[pathRef++]);

					for (var i = 0, il = cur.length, payload; i < il; i++) {
						payload = {
							cur: cur[i],
							parent: parent
						};

						if (options.nestingProcessor) {
							options.nestingProcessor(payload);
						}

						processedSels = this.replaceReferences(payload.cur, payload.parent)
							|| this.prependParent(payload.cur, payload.parent);
						resolved = resolved.concat(processedSels);
					}

					parent = resolved;
				}

				if (!skip) {
					sel.push(parent.join(', '));
					out.push(_.defaults({path: sel}, item));
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
					out.push(range(stream.pos - 1, 1))
				} else {
					stream.skipQuoted();
				}
			}
			return out;
		},

		/**
		 * Builds replacement matrix: an array containing
		 * array of indexes of parent selectors that should be
		 * substituted instead of &-references
		 * @param  {Number} selCount Number of parent selectors
		 * @param  {Number} refCount Number of &-references
		 * @return {Array}
		 */
		makeReplacementMatrix: function(selCount, refCount) {
			var total = Math.pow(selCount, refCount);
			var out = [];
			
			var row = [];
			for (var i = 0; i < refCount; i++) {
				row[i] = 0;
			}

			for (var i = 0, ix; i < total; i++) {
				out.push(row.slice(0));
				ix = row.length - 1;

				// incrementally update indexes of row
				while (ix >= 0) {
					row[ix] = (row[ix] + 1)  % selCount;
					if (row[ix] || !ix) {
						break;
					}
					ix--;
				}
			}

			return out;
		},

		/**
		 * Replaces &-references in selector with parent selector
		 * @param  {String} sel        Child selector with possible &-reference
		 * @param  {Array}  parentSels List of parent selectors to put instead of &-reference
		 * @return {String}            If reference wasn’t found, returns `sel` as-is
		 */
		replaceReferences: function(sel, parentSels) {
			var refs, hasRefs = reHasRef.test(sel);

			if (hasRefs) {
				refs = this.getReferences(sel);
				hasRefs = refs.length;
			}

			if (!hasRefs) {
				// no &-references: nothing to replace
				return null;
			}

			var out = [];
			var matrix = this.makeReplacementMatrix(parentSels.length, refs.length);
			for (var i = 0, il = matrix.length, row, curSel; i < il; i++) {
				row = matrix[i];
				curSel = sel;
				for (var j = row.length - 1; j >= 0; j--) {
					curSel = utils.replaceSubstring(curSel, parentSels[row[j]], refs[j]);
				}
				out.push(curSel);
			}

			return out;
		},

		/**
		 * Prepends parant selectors to given one
		 * @param  {String} sel       Base selectors
		 * @param  {Array} parentSel  List of parent selectors
		 * @return {String}
		 */
		prependParent: function(sel, parentSel) {
			var out = [];
			for (var i = 0, il = parentSel.length; i < il; i++) {
				out.push(parentSel[i] + ' ' + sel);
			}

			return out;
		}
	};
});