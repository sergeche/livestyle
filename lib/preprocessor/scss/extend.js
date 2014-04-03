/**
 * Resolves `@extend` instructions in parsed CSS node list.
 * The list must be resolved by nesting resolver first.
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
		resolve: function(node, state) {
			if (node.name() !== '@extend') {
				return false;
			}

			var exSelector = node.value().replace(reOptional, '').trim();
			exSelector = selector.create(exSelector);
			if (exSelector.parts().length > 1) {
				// SASS 3.3 can’t match nested selectors
				return;
			}

			state.toExtend.push({
				selector: exSelector,
				extendWith: selector.create(state.parent.name),
				node: state.parent
			});
			return true;
		},


		/**
		 * Performs post-processing of resolved CSS tree. This method
		 * actually extends selectors using data stored in given state
		 * @param  {ResolvedNode} root  Root of resolved CSS tree
		 * @param  {Object} state Final state of transformed tree
		 */
		postProcess: function(root, state) {
			state.toExtend.forEach(function(item) {
				item.node.top().children.forEach(function(child) {
					if (child.type == 'section' && child.name.charAt(0) !== '@') {
						var rules = selector.rules(child.name, true);
						var result = extendSelector(rules, item.selector, item.extendWith);
						child.name = result.join(', ');
					}
				});
			});

			this.removeExtendOnly(root);
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
		}
	};
});