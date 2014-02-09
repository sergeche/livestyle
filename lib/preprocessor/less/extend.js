if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var selector = require('../selector');

	var reExtend = /^:?extend\s*\((.+?)\)/;
	var reAll = /\s+all\s*$/;

	function padNum(num, len) {
		len = len || 5;
		num += '';
		while (num.length < len) {
			num = '0' + num;
		}

		return num;
	}

	/**
	 * Parses selector defined in `:extend(...)`
	 * @param  {String} sel Selector to parse
	 * @return {Array}
	 */
	function parseExtendSelector(sel) {
		return selector.rules(sel).map(function(rule) {
			var cleanRule = rule.replace(reAll, '');
			return {
				sel: cleanRule.trim(),
				all: cleanRule !== rule
			};
		});
	}

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
				var parsed = parseExtendSelector(m[1]);
				for (var j = 0, jl = parsed.length; j < jl; j++) {
					extend.unshift(parsed[j]);
				}
			} else {
				// no need to test further: `:extend` fragments must be
				// at the end of selector
				break;
			}
		}

		return {
			sel: fragments.join('').trim(),
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
					out = out.concat(parseExtendSelector(m[1]));
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

	function parseListItemSelectors(item) {
		var curSel = _.last(item.path);
		return selector.rules(curSel).map(selectorFragments);
	}

	/**
	 * @param  {Array} list
	 * @return {Array}
	 */
	function createLookup(list) {
		var out = [];
		list.forEach(function(item, i) {
			var innerExtend = collectInnerExtend(item.node);
			parseListItemSelectors(item).forEach(function(sf, j) {
				sf.listItem = item;
				sf.listIx = i;
				sf.ruleIx = j;
				sf.extendIx = 0;

				var extend = sf.extend.concat(innerExtend);

				if (extend.length) {
					extend.forEach(function(ex, k) {
						out.push(_.extend({}, sf, {
							extend: ex.sel,
							extendAll: ex.all,
							extendIx: k
						}));
					});
				} else {
					sf.extend = null;
					out.push(sf);
				}
			});
		});
		return out;
	}

	function lookupBySelector(lookup) {
		var out = {};
		lookup.forEach(function(item) {
			if (!out[item.sel]) {
				out[item.sel] = [];
			}
			out[item.sel].push(item);
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

	function lookupById(list) {
		var lookup = {};
		list.forEach(function(item) {
			lookup[item.listItem.node.id] = item;
		});
		return lookup;
	}

	function link(ref, item, type) {
		if (ref && item) {
			if (!ref.extendedBy) {
				ref.extendedBy = [];
			}
			if (!_.include(ref.extendedBy, item)) {
				ref.extendedBy.push(item);
			}

			if (!item.toExtend) {
				item.toExtend = [];
			}

			if (!_.include(item.toExtend, ref)) {
				item.toExtend.push(ref);
			}
		}
	}

	function linkExactMatch(sel, item, lookup) {
		if (!lookup[sel]) {
			return;
		}

		lookup[sel].forEach(function(l) {
			link(l, item, 'exact');
		});
	}

	function linkPartialMatch(sel, item, lookup) {
		var fragments = selector.create(sel).fragments();
		lookup.forEach(function(ref) {
			if (matchedFragments(ref.fragments, fragments)) {
				link(ref, item, 'partial');
			}
		});
	}

	function linkExtendedItems(lookup) {
		var nestingLookup = createNestingLookup(lookup);
		lookup.forEach(function(item) {
			if (!item.extend) {
				return;
			}

			var key = nestingKey(item.listItem.path);
			var lookupItems = key ? nestingLookup[key] : lookup;

			if (!item.extendAll) {
				linkExactMatch(item.extend, item, lookupBySelector(lookupItems));
			} else {
				linkPartialMatch(item.extend, item, lookupItems);
			}
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

	function resolveExtended(item, ex) {
		item.__locked = true;
		var extendWith = getResolved(ex);
		if (extendWith === null) {
			// looks like a circular reference
			item.__locked = false;
			return;
		}

		var extended = [];
		extendWith.forEach(function(exSel) {
			if (item.listItem === ex.listItem) {
				// self-referencing, ignore
				return;
			}

			var result;
			if (!ex.extendAll) {
				// requested exact match: run simplier and faster extend
				result = [item.sel, exSel];
			} else {
				result = partialExtend(item.sel, ex.extend, exSel);
			}

			extended = extended.concat(result);
		});
		item.__locked = false;
		return extended;
	}

	/**
	 * Creates key from path that can be used for
	 * nesting lookups
	 * @param  {Array} path Node path
	 * @return {String}     Returns `null` if current path
	 * can’t be used for nesting
	 */
	function nestingKey(path) {
		if (path.length < 2) {
			return '';
		}

		var out = '';
		for (var i = 0, il = path.length - 1; i < il; i++) {
			out += (i ? '/' : '') + path[i];
		}
		return out;
	}

	/**
	 * Returns all child node of given one, including
	 * grandchildren
	 * @param  {CSSNode} node
	 * @return {Array}
	 */
	function allChildSection(node, out) {
		out = out || [];
		for (var i = 0, il = node.children.length; i < il; i++) {
			if (node.children[i].type == 'section') {
				out.push(node.children[i]);
				allChildSection(node.children[i], out);
			}
		}

		return out;
	}

	function createNestingLookup(list) {
		var lookup = {};
		var idLookup = lookupById(list);
		list.forEach(function(item) {
			var key = nestingKey(item.listItem.path);
			if (!(key in lookup)) {
				lookup[key] = [];
			}

			lookup[key].push(item);
			// key might be empty meaning this is a top-level node
			if (key) {
				// add all nested child sections to lookup scope
				_.each(allChildSection(item.listItem.node), function(node) {
					lookup[key].push(idLookup[node.id]);
				});
			}
		});
		return lookup;
	}


	function getResolved(item) {
		if (item.extendedBy) {
			if (item.__locked) {
				return null;
			}

			var extended = [];
			item.extendedBy.forEach(function(ex) {
				var r = resolveExtended(item, ex);
				if (r) {
					extended = extended.concat(r);
				}
			});

			if (extended.length) {
				item.__resolved = [item.sel].concat(_.uniq(extended));
			}
		}

		if (!item.__resolved) {
			item.__resolved = [item.sel];
		}

		return item.__resolved;
	}

	function _orderFn(a, b) {
		if (a.ix == b.ix) {
			return 0;
		}

		return a.ix > b.ix ? 1 : -1; 
	}

	function collectOrderedExtends(items) {
		var orderedItems = [];
		items.forEach(function(rule, i) {
			if (rule.extendedBy) {
				for (var j = 0, jl = rule.extendedBy.length; j < jl; j++) {
					var ex = rule.extendedBy[j];
					var orderParam = padNum(ex.listIx) + '.' + padNum(ex.ruleIx) + '.' + padNum(ex.extendIx);
					orderedItems.push({
						sel: ex.sel,
						ix: orderParam,
						rule: rule,
						ex: ex
					});
				}
			}
		});

		return orderedItems.sort(_orderFn);
	}

	return {
		resolve: function(list) {
			var lookup = createLookup(list);
			var nodeSelLookup = lookupByNode(lookup);
			linkExtendedItems(lookup);

			list.forEach(function(item) {
				var nodeId = item.node.id;
				var currentSel = _.pluck(parseListItemSelectors(item), 'sel');
				// console.log('Testing', currentSel);

				var orderedItems = collectOrderedExtends(nodeSelLookup[nodeId]);

				if (orderedItems.length) {
					var resolved = [];
					orderedItems.forEach(function(item) {
						// console.log('in "%s" extend "%s" with %s', item.rule.sel, item.ex.extend, item.ex.sel);
						var r = resolveExtended(item.rule, item.ex);
						if (r) {
							resolved = resolved.concat(r);
						}
					});

					resolved.forEach(function(item) {
						if (!_.include(currentSel, item)) {
							currentSel.push(item);
						}
					});
				}

				item.path[item.path.length - 1] = currentSel.join(', ');
			});

			return list;
		},

		/**
		 * Strips `:extend` from given selector
		 * @param  {String} sel
		 * @return {String}
		 */
		stripExtend: function(sel) {
			var reExtend = /\s*:extend\s*\((.+?)\)$/g;
			sel = sel.trim();
			while (reExtend.test(sel)) {
				sel = sel.replace(reExtend, '');
			}
			return sel;
		}
	};
});