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

			for (var j = 0, jl = item.children.length; j < jl; j++) {
				child = item.children[j];
				if (reExtend.test(child.name())) {
					toExtend.push({
						sel: child.value().replace(reOptional, '').trim(),
						extendWith: item.name(),
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

	/**
	 * If possible, creates extended copy of `selector` where
	 * part that matches `target` is replaced with `extendWith`
	 * @param  {Object} selector   Selector to extend.
	 * @param  {String} target     Fragment on `selector` that should be replaced
	 * @param  {String} extendWith Selector to extend with
	 * @return {Array}
	 */
	function extendSelector(sel, target, extendWith) {
		if (!_.isArray(sel)) {
			sel = selector.rules(sel, true);
		}

		target = selector.create(target);
		extendWith = selector.create(extendWith);

		// create lookup of existing selectors
		var lookup = {};
		_.each(sel, function(item) {
			lookup[item.toString()] = true;
		});

		var s, extended;
		for (var i = sel.length - 1; i >= 0; i--) {
			sel[i] = selector.create(sel[i]);
			s = sel[i];
			if (s.matchesPart(target, extendWith)) {
				extended = s.extendedCopy(extendWith, target);
				if (!extended) {
					continue;
				}

				extended = _.filter(extended, function(exSel) {
					// selector contains multiple IDs: 
					// unlike SCSS, don’t fail here, simply skip extension
					if (hasMultipleDefs(exSel)) {
						return false;
					}

					// if `extend` produced the same selecor that already exists 
					// in selectors list (self-reference): skip it
					var strSel = exSel.toString();
					if (strSel in lookup) {
						return false;
					}

					lookup[strSel] = true;
					return true;
				});

				sel = sel.concat(extended);
			}
		}

		return sel;
	}

	return {
		resolve: function(list, options) {
			if (!hasExtend(list)) {
				return list;
			}

			// use two-pass filtering: first, find selectors that should 
			// be extended (contains `@extend` child), then actually 
			// extend selectors found
			var toExtend = collectSelectorsToExtend(list);

			// extend selectors
			var lookup = createLookup(list);
			var nestingLookup = createNestingLookup(lookup);

			_.each(toExtend, function(ex, i) {
				var targetSelector = selector.create(ex.sel);
				var extendWith = selector.create(ex.extendWith);
				var key = nestingKey(ex.path);
				var items = key ? nestingLookup[key] : lookup;

				_.each(items, function(l) {
					var ctx = lookup[l.listIx];
					ctx.rules = extendSelector(ctx.rules, targetSelector, extendWith);
				});
			});

			var out = [];
			_.each(lookup, function(l) {
				var rules = _.filter(l.rules, function(rule) {
					return !hasExtendPart(rule);
				});

				if (!rules.length) {
					return;
				}

				var path = l.item.path.slice(0);
				path[path.length - 1] = _.map(rules, function(rule) {
					return rule.toString();
				}).join(', ');

				out.push({
					path: path,
					node: l.item.node
				});
			});

			return out;
		}
	};
});