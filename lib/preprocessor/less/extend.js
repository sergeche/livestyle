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
		return partial 
			? extendPartialMatch(rules, target, extendWith)
			: extendExactMatch(rules, target, extendWith);
	}

	function extendExactMatch(rules, target, extendWith) {
		// for (var i = 0, il = rules.length; i < il; i++) {
		// 	if (rules[i] === extendWith || rules[i].__ref === extendWith) {
		// 		// circular reference
		// 		return [];
		// 	}
		// }
		
		var lookupExtends = [];
		var lookup = rules.map(function(r, i) {
			lookupExtends[i] = '';
			return r.toString().replace(reExtend, function(str) {
				lookupExtends[i] += str;
				return '';
			});
		});

		var result = [];
		var ix = lookup.indexOf(target.toString());
		if (ix !== -1) {
			// replace `:extend()` pseudo-class in extending
			// selector with one from target selector
			// var __ref = extendWith.__ref || extendWith;
			extendWith = extendWith.toString().replace(reExtend, '');
			extendWith = selector.create(extendWith + lookupExtends[ix]);
			// extendWith.__ref = extendWith;
			result.push(extendWith);
		}

		return result;
	}

	function extendPartialMatch(rules, target, extendWith) {
		var extended = [];
		rules.forEach(function(rule) {
			extended = extended.concat(partialExtend(rule, target, extendWith));
		});

		// return extended.length ? rules.slice().concat(extended) : rules;
		return extended;
	}

	function partialExtend(sel, targetSel, extendWith) {
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

			out.push(selector.create( f1.join('') ));
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

	/**
	 * Check if given node is `&:extend()` property
	 * @param  {ResolvedNode}  node
	 * @return {Boolean}
	 */
	function isExtendProperty(node) {
		return node.type === 'property' && node.name === '&';
	}

	function getSelectorsToExtend(rule, node) {
		var out = [], m;
		// we should capture `:extend()`s at the end of selector only
		var fragments = rule.fragments().slice();
		while (fragments.length) {
			if (m = reExtend.exec(fragments.pop())) {
				out = out.concat(parseSelectorToExtend(m[1]).reverse());
			} else {
				break;
			}
		}

		out.reverse();

		// check if given node contains &:extend property
		if (node.children) {
			node.children.forEach(function(child) {
				if (isExtendProperty(child)) {
					child.value.replace(reExtend, function(str, sel) {
						out = out.concat(parseSelectorToExtend(sel));
					});
				}
			});
		}

		return out;
	}

	return {
		resolve: function(tree) {
			var self = this;
			var list = [];

			var save = function(item) {
				if (/^@media/.test(item.name)) {
					self.resolve(item);
					return item.children.forEach(save);
				}

				if (item.type == 'section') { // not a root element or property
					list.push({
						node: item,
						name: item.name,
						parsedRules: selector.rules(item.name, true)
					});
				}
			};
			tree.children.forEach(save);

			list.forEach(function(item) {
				// in case of root node, we will select all nested sections
				// but should extend only with top-most nodes
				if (item.node === tree) {
					return;
				}

				list.forEach(function(child) {
					if (child === item) {
						return;
					}

					var extended = child.extended || [];
					item.parsedRules.forEach(function(rule) {
						// detect circular refereces
						if (rule.__fromNode === child.node) {
							return;
						}

						var rulesToExtend = child.parsedRules.filter(function(ruleTX) {
							return !ruleTX.__fromNode || ruleTX.__fromNode !== rule.__fromNode;
						});


						var toExtend = getSelectorsToExtend(rule, item.node);
						if (!toExtend.length) {
							return;
						}

						toExtend.forEach(function(ex) {
							extended = extended.concat(extendSelector(rulesToExtend, ex.sel, rule, ex.all));
						});
					});

					// mark rules with source nodes so we can detect circular
					// references later
					extended.forEach(function(sel) {
						sel.__fromNode = item.node;
					});

					child.parsedRules = child.parsedRules.concat(extended);
					// child.extended = extended;
				});
			});

			// clean-up
			list.forEach(function(item) {
				var rules = item.extended ? item.parsedRules.concat(item.extended) : item.parsedRules;

				item.node.name = rules.map(function(rule) {
					return rule.toString().replace(reExtend, '');
				}).join(', ');

				// remove &:extend() properties
				for (var i = item.node.children.length - 1, child; i >= 0; i--) {
					child = item.node.children[i];
					if (isExtendProperty(child)) {
						item.node.children.splice(i, 1);
					}
				};
			});

			return tree;
		}
	};
});