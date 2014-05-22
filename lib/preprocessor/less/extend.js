/**
 * `:extend()` resolver for LESS.
 * Works in two steps:
 * 1. Collect all nodes with `:extend()` token
 * 2. Extend transformed LESS tree
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var selector = require('../selector');
	var section = require('./section');

	var reExtend = /:?extend\s*\((.+?)\)/g;
	var reAll = /\s+all\s*$/;

	function ExtendItem(parsedSel, section, ruleIx) {
		this.selector = selector.create(parsedSel.sel);
		this.selectorString = parsedSel.sel;
		this.all = parsedSel.all;
		this.node = section;
		this.ruleIx = ruleIx;
	}

	ExtendItem.prototype = {
		get extendWith() {
			return this.node.rules[this.ruleIx];
		},

		extend: function(rules) {
			
		},

		exactExtend: function(rules) {
			var targetStr = target.toString();
			var out = rules.map(function(r) {
				return r.toString();
			});
			if (out.indexOf(target.toString()) !== -1) {
				out.push(extendWith.toString());
			}

			return out;
		}
	};

	function isExtendProperty(node) {
		return node.type == 'property' 
			&& node.name() == '&'
			&& reExtend.test(node.value());
	}

	function isExtendSection(node) {
		return reExtend.test(node.name());
	}

	/**
	 * Parses selector defined in `:extend(...)`
	 * @param  {String} sel Selector to parse
	 * @return {Array}
	 */
	function parseSelectorToExtend(sel) {
		return selector.rules(sel).map(function(rule) {
			var cleanRule = rule.replace(reAll, '');
			return {
				sel: selector.create(cleanRule.trim()),
				all: cleanRule !== rule
			};
		});
	}

	function save(extendWith, selectors, state) {
		extendWith = selector.create(extendWith);
		parseSelectorToExtend(selectors).forEach(function(item, i) {
			state.toExtend.push({
				selector: selector.create(item.sel),
				all: item.all,
				extendWith: extendWith,
				node: state.parent,
				ix: i
			});
		});
	}

	function extendSelector(rules, target, extendWith, partial) {
		if (~rules.indexOf(extendWith)) {
			// circular reference
			return rules;
		}

		return partial 
			? extendPartialMatch(rules, target, extendWith)
			: extendExactMatch(rules, target, extendWith);
	}

	function extendExactMatch(rules, target, extendWith) {
		var lookup = rules.map(function(r) {
			return r.toString().replace(reExtend, '');
		});
		var result = rules.slice();

		if (lookup.indexOf(target.toString()) !== -1) {
			result.push(extendWith);
			// console.log('pushing', extendWith.toString());
		}

		return result;
	}

	function extendPartialMatch(rules, target, extendWith) {
		return rules.map(function(rule) {
			return partialExtend(rule, target, extendWith);
		});
	}

	function partialExtend(sel, targetSel, extendWith) {
		var exInfo = selectorFragments(extendWith);

		var selFragments = sel.fragments();
		var targetSelFragments = targetSel.fragments();
		var extendWithFragments = extendWith.fragments();

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
				var parsed = parseSelectorToExtend(m[1]);
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
	 * Prepares resolved tree for extending: splits every selector 
	 * into rules and extracts extends from it
	 * @param  {ResolvedNode} tree Root of resolved preprocessor tree
	 */
	function prepareTree(tree) {
		var out = [];

		var save = function(selectors, section, ruleIx) {
			parseSelectorToExtend(selectors).forEach(function(item, i) {
				out.push(new ExtendItem(item, section, ruleIx));
			});
		};

		tree.sectionList().forEach(function(item) {
			var section = item.node;
			section.rules = selector.rules(section.name)
				.map(function(rule, i) {
					rule = rule.replace(reExtend, function(str, sel) {
						save(sel, section, i);
						return '';
					});
					return selector.create(rule);
				});
		});
		return out;
	}

	function getSelectorsToExtend(rule) {
		var out = [];
		rule.fragments().forEach(function(fragment) {
			fragment.replace(reExtend, function(str, sel) {
				out = out.concat(parseSelectorToExtend(sel));
			});
		});
		return out;
	}

	return {
		resolve: function(tree) {
			// var preparedTree = prepareTree(tree);
			// preparedTree.forEach(function(item) {
			// 	item.node.top().children.forEach(function(child) {
			// 		if (child.type == 'section' && child.name.charAt(0) !== '@') {
			// 			console.log('in "%s", try to extend "%s" with %s', child.name, item.selector, item.extendWith);
			// 			var result = extendSelector(child.rules, item.selector, item.extendWith, item.all);
			// 			console.log('result', result);
			// 		}
			// 	});
			// });

			var list = tree.sectionList().map(function(item) {
				item.parsedRules = selector.rules(item.name, true);
				return item;
			});

			list.forEach(function(item) {
				item.parsedRules.forEach(function(rule) {
					var toExtend = getSelectorsToExtend(rule);
					if (!toExtend.length) {
						return;
					}
					// console.log('to extend', toExtend);

					list.forEach(function(child) {
						if (child === item) {
							return;
						}
						// console.log('-->', child.parsedRules.toString());
						toExtend.forEach(function(ex) {
							// console.log('extend "%s" with "%s"', ex.sel.toString(), rule);
							var result = extendSelector(child.parsedRules, ex.sel, rule, ex.all);
							child.parsedRules = result;
							// console.log('result', result);
						});
					});


				});
			});

			// clean-up
			list.forEach(function(item) {
				item.node.name = item.parsedRules.map(function(rule) {
					return rule.toString().replace(reExtend, '');
				}).join(', ');
			});

			return tree;
		},
		resolveOld: function(node, state) {
			return false;
			if (isExtendProperty(node)) {
				// store extend call defined as
				// &:extend(...)
				var m = node.value().match(reExtend);
				if (m) {
					save(state.parent.name, m[1], state);
				}

				return true;
			}

			if (isExtendSection(node)) {
				// find `:extend()` addon in selector rules
				var rules = selector.rules(node.name()).map(function(rule) {
					var ex = [];
					rule = rule.replace(reExtend, function(str, sel) {
						ex.push(sel);
						return '';
					});

					ex.forEach(function(sel) {
						save(rule, sel, state);
					});

					return rule;
				});

				section.resolve(node, state, rules.join(', '));
				return true;
			}

			return false;
		},

		postProcess: function(root, state) {
			return;
			state.toExtend.forEach(function(item) {
				item.node.top().children.forEach(function(child) {
					if (child.type == 'section' && child.name.charAt(0) !== '@') {
						console.log('in "%s", try to extend "%s" with %s', child.name, item.selector, item.extendWith);
						var rules = selector.rules(child.name, true);
						var result = extendSelector(rules, item.selector, item.extendWith, item.all);
						child.name = result.join(', ');
					}
				});
			});
		}
	};
});