if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var selector = require('../selector');

	var reExtend = /^:?extend\s*\((.+?)(\sall\s*)?\)/;

	/**
	 * Extracts all fragments from given selector and splits
	 * them across two arrays: one with CSS parts, another one with
	 * `:extend()` fragments
	 * @param  {Selector} sel
	 * @return {Object}
	 */
	function selectorFragments(sel) {
		sel = selector.create(sel);
		var fragments = sel.fragments();
		var extend = [];
		// move all `:extend()` frgaments to separate array
		for (var i = fragments.length - 1, m; i >= 0; i--) {
			m = reExtend.exec(fragments[i]);
			if (m) {
				fragments.pop();
				extend.unshift({
					sel: m[1].trim(),
					all: !!m[2]
				});
			} else {
				// no need to test further: `:extend` fragments must be
				// at the end of selector
				break;
			}
		}

		return {
			sel: fragments.join(''),
			originalSel: sel,
			fragments: fragments,
			extend: extend
		};
	}

	/**
	 * Check if current tree node contains extends defined in it
	 * as `&:extend(...)`
	 * @param  {CSSNode} node
	 * @return {Array}   List of extends found
	 */
	function collectInnerExtend(node) {
		var out = [];
		node.children.forEach(function(child) {
			if (child.type !== 'section' && child.name() == '&') {
				var m = child.value().match(reExtend);
				if (m) {
					out.push({
						sel: m[1].trim(),
						all: !!m[2]
					});
				}
			}
		});
		
		return out;
	}

	/**
	 * Returns object with `from` and `to` indexes indicating
	 * part of `sel1` that fully matches `sel2`
	 * @param  {Selector} sel1 
	 * @param  {Selector} sel2
	 * @return {Object} Returns `null` if exact match cannor be found
	 */
	function matchedFragments(sel1, sel2, startPos) {
		var f1 = Array.isArray(sel1) ? sel1 : sel1.fragments();
		var f2 = Array.isArray(sel2) ? sel2 : sel2.fragments();

		if (f2.length > f1.length) {
			return null;
		}

		var from = f1.indexOf(f2[0], startPos || 0);
		if (from == -1 || from + f2.length > f1.length) {
			return null;
		}

		// make sure all tokens match
		for (var i = 1, il = f2.length; i < il; i++) {
			if (f1[from + i] !== f2[i]) {
				return null;
			}
		}

		return {from: from, to: from + f2.length};
	}

	/**
	 * @param  {Array} list
	 * @return {Array}
	 */
	function createLookup(list) {
		var out = [];
		list.forEach(function(item) {
			var curSel = _.last(item.path);
			selector.rules(curSel).forEach(function(sel) {
				var sf = selectorFragments(sel);
				sf.listItem = item;
				sf.extend = sf.extend.concat(collectInnerExtend(item.node));
				out.push(sf);
			});
		});
		return out;
	}

	function lookupBySelector(lookup) {
		var out = {};
		lookup.forEach(function(item) {
			out[item.sel] = item;
		});
		return out;
	}

	function lookupByNode(lookup) {
		var out = {};
		lookup.forEach(function(item) {
			var node = item.listItem.node;
			if (!out[node.id]) {
				out[node.id] = [];
			}

			out[node.id].push(item);
		});
		return out;
	}

	function link(ref, item, type) {
		if (ref && item) {
			if (!ref.extendedBy) {
				ref.extendedBy = [];
			}
			ref.extendedBy.push(item);

			if (!item.toExtend) {
				item.toExtend = [];
			}

			item.toExtend.push(ref);
		}
	}

	function linkExactMatch(sel, item, selLookup) {
		link(selLookup[sel], item, 'exact');
	}

	function linkPartialMatch(sel, item, lookup) {
		sel = selector.create(sel);
		var fragments = sel.fragments();
		lookup.forEach(function(ref) {
			if (matchedFragments(ref.fragments, fragments)) {
				link(ref, item, 'partial');
			}
		});
	}

	function linkExtendedItems(lookup) {
		var selLookup = lookupBySelector(lookup);
		lookup.forEach(function(item) {
			if (!item.extend.length) {
				return;
			}

			item.extend.forEach(function(ex) {
				if (!ex.all) {
					linkExactMatch(ex.sel, item, selLookup);
				} else {
					linkPartialMatch(ex.sel, item, lookup);
				}
			});
		});

		return lookup;
	}

	function partialExtend(sel, targetSel, extendWith) {
		sel = selector.create(sel);
		extendWith = selector.create(extendWith);
		targetSel = selector.create(targetSel);

		var exInfo = selectorFragments(extendWith);

		var selFragments = sel.fragments();
		var targetSelFragments = targetSel.fragments();

		var out = [];

		var ranges = [], offset = 0, m;
		while (m = matchedFragments(selFragments, targetSelFragments, offset)) {
			ranges.push(m);
			offset = m.to;
		}

		if (ranges.length) {
			var f1 = selFragments.slice(0);
			var f2 = targetSelFragments;
			for (var i = ranges.length - 1, r; i >= 0; i--) {
				r = ranges[i];
				f1.splice(r.from, r.to - r.from, exInfo.sel);
			}

			out.push(f1.join(''));
		}


		return out;
	}


	function getResolved(item) {
		if (item.extendedBy) {
			if (item.__locked) {
				return null;
			}

			item.__locked = true;
			var extended = [];
			item.extendedBy.forEach(function(ex) {
				var extendWith = getResolved(ex);
				if (extendWith === null) {
					// looks like a circular reference
					return;
				}

				extendWith.forEach(function(exSel) {
					ex.extend.forEach(function(sel) {
						console.log('In [%s] extend "%s" with "%s"', item.sel, sel.sel, exSel);

						if (item.listItem === ex.listItem) {
							// self-referencing, ignore
							return;
						}
						var result;
						if (!sel.all) {
							// requested exact match: run simplier and faster extend
							result = [item.sel, exSel];
						} else {
							result = partialExtend(item.sel, sel.sel, exSel);
						}

						if (!item.resolvedExtendedBy) {
							item.resolvedExtendedBy = {};
						}

						if (!item.resolvedExtendedBy[exSel]) {
							item.resolvedExtendedBy[exSel] = [];
						}

						item.resolvedExtendedBy[exSel] = item.resolvedExtendedBy[exSel].concat(result);

						extended = extended.concat(result);
					});
				});
			});

			if (extended.length) {
				item.__resolved = [item.sel].concat(_.uniq(extended));
			}

			item.__locked = false;
			item.extendedBy = null;
		}

		if (!item.__resolved) {
			item.__resolved = [item.sel];
		}

		return item.__resolved;
	}

	return {
		resolve: function(list) {
			var lookup = createLookup(list);
			var nodeLookup = {};
			list.forEach(function(item) {
				nodeLookup[item.node.id] = item;
			})
			var nodeSelLookup = lookupByNode(lookup);
			var selLookup = lookupBySelector(lookup);
			linkExtendedItems(lookup);

			// lookup.forEach(function(item) {
			// 	if (!item.toExtend) {
			// 		return;
			// 	}

			// 	item.toExtend.forEach(function(toExtend) {
			// 		getResolved(toExtend);
			// 		var target = selLookup[toExtend.sel];
			// 		if (target.resolvedExtendedBy && target.resolvedExtendedBy[item.sel]) {
			// 			var nlp = nodeLookup[toExtend.listItem.node.id];
			// 			if (!nlp.__extendedSel) {
			// 				nlp.__extendedSel = [];
			// 			}
			// 			nlp.__extendedSel = nlp.__extendedSel.concat(target.resolvedExtendedBy[item.sel]);
			// 		}
			// 	})
			// });

			// list.forEach(function(item) {
			// 	if (item.__extendedSel) {
			// 		var curSels = _.pluck(nodeSelLookup[item.node.id], 'sel');
			// 		curSels = _.uniq(curSels.concat(item.__extendedSel));
			// 		item.path[item.path.length - 1] = curSels.join(', ');
			// 	}
			// });





			list.forEach(function(item) {
				var nodeId = item.node.id;
				var resolved = [];
				var current = [];
				console.log('Testing', _.pluck(nodeSelLookup[nodeId], 'sel'));

				nodeSelLookup[nodeId].forEach(function(l) {
					current.push(l.sel);
					resolved = resolved.concat(getResolved(l));

					if (l.toExtend) {
						var toAppend = []
						l.toExtend.forEach(function(ex) {
							// console.log('lookup', ex.sel, l.sel);
							var target = selLookup[ex.sel];
							if (target.resolvedExtendedBy && target.resolvedExtendedBy[l.sel]) {
								toAppend = toAppend.concat(target.resolvedExtendedBy[l.sel]);
								// console.log('resolved selectors', target.resolvedExtendedBy[l.sel]);
							}
						});

						if (toAppend.length) {
							console.log('to append', toAppend);
						}
					}
				});

				var allSel = _.uniq(current.concat(resolved));
				item.path[item.path.length - 1] = allSel.join(', ');
			});

			return list;
		}
	};
});