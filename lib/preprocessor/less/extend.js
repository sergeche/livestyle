if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var selector = require('../selector');
	var section = require('./section');

	var reExtend = /\bextend\s*\((.+?)\)/g;

	function isExtendProperty(node) {
		return node.type == 'property' 
			&& node.name() == '&'
			&& reExtend.test(node.value());
	}

	function isExtendSection(node) {
		return node.type == 'section' && reExtend.test(node.name());
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
				sel: cleanRule.trim(),
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
		var targetStr = target.toString();
		var out = rules.map(function(r) {
			return r.toString();
		});
		if (out.indexOf(target.toString()) !== -1) {
			out.push(extendWith.toString());
		}

		return out.join(', ');
	}

	function extendPartialMatch(rules, target, extendWith) {
		return rules.map(function(r) {
			return partialExtend(r, target, extendWith);
		}).join(', ');
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

	return {
		resolve: function(node, state) {
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

					save(rule, ex, state);
					return rule;
				});

				section.resolve(node, state, rules.join(', '));
				return true;
			}

			return false;
		},

		postProcess: function(root, state) {
			state.toExtend.forEach(function(item) {
				item.node.top().children.forEach(function(child) {
					if (child.type == 'section' && child.name.charAt(0) !== '@') {
						var rules = selector.rules(child.name, true);
						var result = extendSelector(rules, item.selector, item.extendWith, item.all);
						child.name = result.join(', ');
					}
				});
			});
		}
	};
});