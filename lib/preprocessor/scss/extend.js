/**
 * Resolves `@extend` instructions in parsed CSS node list.
 * The list must be resolved by nesting resolver first.
 * @type {[type]}
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var selector = require('../selector');

	var reExtend = /^@extend\b/;
	var reOptional = /\s+\!optional\s*$/;
	var reExtPart = /^%/;
	var reName = /^[a-z\-_]/i;

	/**
	 * Quickly detects if given list of parsed CSS tree
	 * nodes contains `@extend` instructions
	 * @param  {Array}  list Plain list of selectors
	 * @return {Boolean}
	 */
	function hasExtend(list) {
		for (var i = 0, il = list.length; i < il; i++) {
			var item = list[i].node;
			for (var j = 0, jl = item.children.length; j < jl; j++) {
				if (reExtend.test(item.children[j].name())) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Check if given selector has extend part
	 * @param  {Selector}  sel
	 * @return {Boolean}
	 */
	function hasExtendPart(sel) {
		var parts = sel.parts();
		
		for (var i = parts.length - 1; i >= 0; i--) {
			var frags = parts[i].fragments();
			for (var j = frags.length - 1; j >= 0; j--) {
				if (reExtPart.test(frags[j])) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Collects selectors from list that should be extended
	 * @param  {Array} list
	 * @return {Array}
	 */
	function collectSelectorsToExtend(list) {
		var toExtend = [];
		
		var child, childName;
		for (var i = 0, il = list.length, item; i < il; i++) {
			item = list[i].node;

			for (var j = 0, jl = item.children.length, sel; j < jl; j++) {
				child = item.children[j];
				if (reExtend.test(child.name())) {
					sel = child.value().replace(reOptional, '').trim();
					sel = selector.create(sel);
					if (sel.parts().length > 1) {
						// SASS 3.3 can’t match nested selectors
						continue;
					}

					toExtend.push({
						sel: sel,
						extendWith: selector.create(item.name()),
						node: item,
						path: list[i].path
					});
				}
			}
		}

		return toExtend;
	}

	function createLookup(list) {
		return _.map(list, function(item, i) {
			return {
				listIx: i,
				rules: selector.rules(_.last(item.path), true),
				item: item
			};
		});
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
			return null;
		}

		var out = '';
		for (var i = 0, il = path.length - 1; i < il; i++) {
			out += (i ? '/' : '') + path[i];
		}
		return out;
	}

	function createNestingLookup(list) {
		var lookup = {};
		_.each(list, function(item) {
			var key = nestingKey(item.item.path);
			if (!key) {
				return;
			}

			if (!(key in lookup)) {
				lookup[key] = [];
			}

			lookup[key].push(item);
		});
		return lookup;
	}

	/**
	 * Check if given selector contains multiple definitions of
	 * fragments that should have only one occurence
	 * @param  {Selector} sel
	 * @return {Boolean}
	 */
	function hasMultipleDefs(sel) {
		var reDef = /^(#|::)/;
		var parts = sel.parts();
		var matched, part, m;
		for (var i = 0, il = parts.length; i < il; i++) {
			part = parts[i];
			matched = {};
			for (var j = 0, jl = part._fragments.length; j < jl; j++) {
				if (m = reDef.exec(part._fragments[j])) {
					if (matched[m[1]]) {
						return true;
					}
					matched[m[1]] = true;
				}
			}
		}
	}

	function partsMatch(part1, part2) {
		var op1 = part1.op || ' ';
		var op2 = part2.op || ' ';

		if (op1 != op2) {
			return false;
		}

		var f1 = part1.fragments();
		var f2 = part2.fragments();

		var name1 = reName.test(f1[0]) ? f1[0] : null;
		var name2 = reName.test(f2[0]) ? f2[0] : null;

		if (name2 && name1 !== name2) {
			return false;
		}

		for (var i = name2 ? 1 : 0, il = f2.length; i < il; i++) {
			if (!_.include(f1, f2[i])) {
				return false;
			}
		}

		return true;
	}

	function matchedSelectorPart(sel, part) {
		var selParts = sel.parts();
		var testPart = part.parts()[0];

		for (var i = 0, il = selParts.length; i < il; i++) {
			if (partsMatch(selParts[i], testPart)) {
				return i;
			}
		}

		return null;
	}

	/**
	 * Returns "extended" version of given part:
	 * replaces `target` fragments in current part with ones in `extendWith`
	 * @param {SelectorPart} part
	 * @param {SelectorPart} target
	 * @param {SelectorPart} extendWith
	 * @return {SelectorPart}
	 */
	function extendPart(part, target, extendWith) {
		extendWith = extendWith.clone();
		var extended = part.copyWithRemovedFragments(target);
		extended.op = extendWith.op;
		var ef = extended._fragments;
		var pf = extendWith._fragments;

		// basically, all we have to do is to append all fragments
		// from `extendWith` to `extended`, but with one exception:
		// if part’s first fragment is element, we have to place
		// it *before* existing fragments
		if (reName.test(pf[0])) {
			if (reName.test(ef[0])) {
				ef[0] = pf.shift();
			} else {
				ef.unshift(pf.shift());
			}
		}

		// find best insertion point
		// in case we have pseudo-classes, insertion point should be right
		// before first pseudo-class
		var insPos = ef.length;
		for (var i = 0, il = ef.length; i < il; i++) {
			if (ef[i].charAt(0) == ':') {
				insPos = i;
				break;
			}
		}

		// skip duplicates for SCSS
		pf.forEach(function(f) {
			if (!_.include(ef, f)) {
				if (f.charAt(0) !== ':') {
					ef.splice(insPos++, 0, f);
				} else {
					ef.push(f);
				}
			}
		});

		return extended.orderFragmens();
	}

	/**
	 * From `selParts1` removes parts that are common with `selParts2 
	 * @param  {Array} selParts1 
	 * @param  {Array} selParts2 
	 * @return {Array}
	 */
	function removeCommonParts(selParts1, selParts2) {
		for (var i = 0, il = Math.min(selParts1.length, selParts2.length); i < il; i++) {
			if (!selParts1[i].equal(selParts2[i])) {
				return selParts1.slice(i);
			}
		}

		return [];
	}

	/**
	 * If possible, creates extended copy of `selector` where
	 * part that matches `target` is replaced with `extendWith`
	 * @param  {Array} rules   List of selectors to extend
	 * @param  {Selector} target     Fragment on `selector` that should be replaced
	 * @param  {Selector} extendWith Selector to extend with
	 * @return {Array}
	 */
	function extendSelector(rules, target, extendWith) {
		// create lookup of existing selectors
		var lookup = {};
		_.each(rules, function(item) {
			lookup[item.toString()] = true;
		});

		var exParts = extendWith.parts().slice(0);
		var exLastPart = exParts.pop();
		if (exParts.length && !exParts[0].op) {
			exParts[0].op = ' ';
		}

		var addons = [];
		rules.forEach(function(sel) {
			var mp = matchedSelectorPart(sel, target);
			if (mp === null) {
				return;
			}

			// We have matched part, let’s extend selector.
			// SASS extends last part of the selector.
			var selParts = sel.parts().slice(0);

			var extendedPart = extendPart(selParts[mp], target.parts()[0], exLastPart);
			if (!extendedPart.op) {
				extendedPart.op = ' ';
			}

			if (!selParts[0].op) {
				selParts[0].op = ' ';
			}

			// SASS has effing strange extend mechanism:
			// 1. In base selector `target` is replaced with `extendWith` part (obivious)
			// 2. Takes lastest part of `extendWith` selector with ' ' operator, 
			// inserts it instead of `target` in base selector and prepends initial 
			// `extendWith` parts (what? is there any living person who can 
			// easily come up to such behaviour?)
			var exVariants = [
				[].concat(selParts.slice(0, mp), removeCommonParts(exParts, selParts), [extendedPart], selParts.slice(mp + 1))
			];

			exParts.push(extendedPart);
			// find out part that can be used as permutation point
			var permIx = -1;
			for (var i = exParts.length - 1; i >= 0; i--) {
				if (exParts[i].op === ' ') {
					permIx = i;
					break;
				}
			}

			if (permIx > 0) {
				exVariants.push(
					[].concat(exParts.slice(0, permIx), removeCommonParts(selParts.slice(0, mp), exParts), exParts.slice(permIx), selParts.slice(mp + 1))
				);
			}

			exVariants.forEach(function(extended) {
				extended = selector.create(extended);

				var strSel = extended.toString();
				if (strSel in lookup) {
					return;
				}

				lookup[strSel] = true;
				addons.push(extended);
			});

			// var extended = [].concat(selParts.slice(0, mp), exParts, [extendedPart], selParts.slice(mp + 1));
		});

		return rules.concat(addons);
	}

	function hasExtendFragment(rule) {
		var reTest = /^%/;
		return !!_.find(rule.fragments(), function(f) {
			return reTest.test(f);
		});
	}

	return {
		resolve: function(list) {
			if (!list.length) {
				return;
			}

			list.forEach(function(item) {
				item.node.top().children.forEach(function(child) {
					if (child.type == 'section' && child.name.charAt(0) !== '@') {
						var rules = selector.rules(child.name, true);
						var result = extendSelector(rules, item.selector, item.extendWith);
						child.name = result.join(', ');
					}
				});
			});
		},

		/**
		 * Removes extend-only selectors: the selectors containing %-token
		 * @param {ResolvedNode} tree
		 */
		removeExtendOnly: function(tree) {
			var item, rules, self = this;
			var filterExtends = function(rule) {
				return !hasExtendFragment(rule);
			};

			for (var i = tree.children.length - 1; i >= 0; i--) {
				item = tree.children[i];
				if (item.type !== 'section') {
					continue;
				}

				rules = selector.rules(item.name, true).filter(filterExtends);
				if (!rules.length) {
					item.remove();
				} else {
					item.name = _.invoke(rules, 'toString').join(', ');
					self.removeExtendOnly(item);
				}
			};
		},

		/**
		 * Saves info about @extend node in `state` object
		 */
		save: function(node, state) {
			var extendSelector = node.value().replace(reOptional, '').trim();
			extendSelector = selector.create(extendSelector);
			if (extendSelector.parts().length > 1) {
				// SASS 3.3 can’t match nested selectors
				return;
			}

			state.toExtend.push({
				selector: extendSelector,
				extendWith: selector.create(state.parent.name),
				node: state.parent
			});
		}
		// resolve: function(list, options) {
		// 	if (!hasExtend(list)) {
		// 		return list;
		// 	}

		// 	// use two-pass filtering: first, find selectors that should 
		// 	// be extended (contains `@extend` child), then actually 
		// 	// extend selectors found
		// 	var toExtend = collectSelectorsToExtend(list);

		// 	// extend selectors
		// 	var lookup = createLookup(list);
		// 	var nestingLookup = createNestingLookup(lookup);

		// 	_.each(toExtend, function(ex, i) {
		// 		var key = nestingKey(ex.path);
		// 		var items = key ? nestingLookup[key] : lookup;

		// 		_.each(items, function(l) {
		// 			var ctx = lookup[l.listIx];
		// 			// console.log('In "%s", extend "%s" with "%s"', ctx.rules, ex.sel, ex.extendWith);
		// 			ctx.rules = extendSelector(ctx.rules, ex.sel, ex.extendWith);
		// 		});
		// 	});

		// 	var out = [];
		// 	_.each(lookup, function(l) {
		// 		var rules = _.filter(l.rules, function(rule) {
		// 			return !hasExtendPart(rule);
		// 		});

		// 		if (!rules.length) {
		// 			return;
		// 		}

		// 		var path = l.item.path.slice(0);
		// 		path[path.length - 1] = _.map(rules, function(rule) {
		// 			return rule.toString();
		// 		}).join(', ');

		// 		out.push({
		// 			path: path,
		// 			node: l.item.node
		// 		});
		// 	});

		// 	return out;
		// },


	};
});