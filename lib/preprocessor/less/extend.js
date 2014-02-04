/**
 * Resolves `:extend()` instructions in parsed LESS nodes
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var selector = require('../selector');
	var lookupFactory = require('../lookup');
	var stringStream = require('../../../node_modules/emmet/lib/assets/stringStream');
	var range = require('../../../node_modules/emmet/lib/assets/range');
	var utils = require('../../../node_modules/emmet/lib/utils/common');

	var reExtend = /:extend\s*\((.+?)\)/g;
	var reExtendFull = /:extend\s*\((.+?)(\sall\s*)?\)/g;
	// var reInnerExtend = /^extend\s*\((.+?)\)/;
	var reInnerExtend = /^extend\s*\((.+?)(\sall\s*)?\)/;
	var reAll = /\s+all$/;

	function ExtendItem(selData, listItem, toExtend, all) {
		if (!Array.isArray(selData)) {
			selData = [selData];
		}

		this.sel = selData.map(function(item) {
			return {
				sel: item.sel,
				all: item.all,
				rules: selector.rules(item.sel, true)
			};
		});

		this.listItem = listItem;
		this.nodeId = listItem.node.id;
		this.toExtend = toExtend;
		// this.node = listItem.node;
		this._selCache = null;
		this._selCacheKey = null;
		this._all = !!all;
		// this._all = true;
		
		// this._rules = selector.rules(_.last(this.listItem.path), true);
	}

	ExtendItem.prototype = {
		extendWith: function(baseSel) {
			var sel = _.last(this.listItem.path);
			// if we have cached value, validate it first
			if (this._selCache !== null && this._selCacheKey === sel) {
				return this._selCache;
			}

			this._selCacheKey = sel;

			var rules = selector.rules(sel);
			if (!this._all) {
				var out = [];
				this.sel.forEach(function(item) {
					var re = new RegExp(':extend\\s*\\(\\s*' + item.sel + '\\s*\\)');
					rules.forEach(function(rule) {
						if (re.test(rule)) {
							out.push(rule);
						}
					});
				});

				rules = out;
			}

			this._selCache = rules.map(function(rule) {
				// return selector.create(stripExtend(rule));
				return selector.create(rule);
			});

			return this._selCache;
		}
	};

	/**
	 * Strips `:extend` from given selector
	 * @param  {String} sel
	 * @return {String}
	 */
	function stripExtend(sel) {
		return sel.replace(reExtend, '').trim();
	}

	/**
	 * Removes `:extend` in given path
	 * @param  {Array} path
	 * @return {Array}
	 */
	function removeExtendFromPath(path) {
		for (var i = 0, il = path.length; i < il; i++) {
			path[i] = stripExtend(path[i]);
		}

		return path;
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

	/**
	 * Extracts all fragments from given selector and splits
	 * them across two arrays: one with CSS parts, another one with
	 * `:extend()` fragments
	 * @param  {Selector} sel
	 * @return {Object}
	 */
	function selectorFragments(sel) {
		var fragments = selector.create(sel).fragments();
		var extend = [];
		// move all `:extend()` frgaments to separate array
		for (var i = fragments.length - 1; i >= 0; i--) {
			if (reExtend.test(fragments[i])) {
				extend.unshift(fragments.pop());
			} else {
				// no need to test further: `:extend` fragments must be
				// at the end of selector
				break;
			}
		}

		return {
			fragments: fragments,
			extend: extend
		};
	}

	function LookupItem(sel, listItem) {
		this.sel = sel;
		this.listItem = listItem;
		this.node = this.listItem.node;
		var sf = selectorFragments(sel);
		this.fragments = sf.fragments;
		this.extend = sf.extend;

		this._cleanSel = null;
		this._extendStr = null;
	}

	LookupItem.prototype = {
		/**
		 * Returns parsed path of current node
		 * @return {Array}
		 */
		path: function() {
			return this.listItem.path;
		},

		cleanSelector: function() {
			if (this._cleanSel === null) {
				this._cleanSel = this.fragments.join('');
			}

			return this._cleanSel;
		},

		extendModifier: function() {
			if (this._extendStr === null) {
				this._extendStr = this.extend.join('');
			}

			return this._extendStr;
		},

		matches: function(sel, exact) {
			if (exact) {
				return this.cleanSelector() == sel.toString();
			}

			return !!matchedFragments(this.fragments, sel);
		}
	};

	/**
	 * Creates lookup used for extending selectors
	 * @param  {Array} list List of tree nodes
	 * @return {Array}
	 */
	function createLookup(list) {
		var out = [];
		list.forEach(function(item) {
			selector.rules(_.last(item.path), true).forEach(function(sel) {
				out.push(new LookupItem(sel, item));
			});
		});

		return out;
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

	function createNestingLookup(list) {
		var lookup = {};
		var idLookup = lookupFactory.idLookup(list);
		list.forEach(function(item) {
			var key = nestingKey(item.path());
			if (!(key in lookup)) {
				lookup[key] = [];
			}

			lookup[key].push(item);
			if (key) {
				// add all nested child sections to lookup scope
				_.each(allChildSection(item.node), function(node) {
					lookup[key].push(idLookup[node.id]);
				});
			}
		});
		return lookup;
	}

	function replaceExtend(sel, extendSel) {
		return sel.replace(reExtend, function(str) {
			return ':extend(' + sel + ')';
		});
	}

	function simpleExtend(targetRules, extendWith, lookupItem, exItem) {
		var rulesLookup = {};
		var extendWithClean = stripExtend(extendWith);
		_.each(lookupItem.rules(), function(rule) {
			var ext = '';
			rule = rule.toString().replace(reExtend, function(str) {
				ext += str;
				return '';
			});

			rulesLookup[rule.trim()] = ext;
		});

		_.each(targetRules, function(targetSelector) {
			targetSelector = targetSelector.toString();
			// console.log('do simple extend "%s" with "%s', targetSelector, extendWith);

			if (targetSelector in rulesLookup && !(extendWithClean in rulesLookup)) {
				var path = lookupItem.listItem.path;
				rulesLookup[extendWithClean] = true;

				// var sel = path[path.length - 1];
				// var extended = selector.extend(sel, targetSelector, extendWith, {syntax: 'less'});
				// path[path.length - 1] = _.invoke(extended, 'toString').join(', ');

				// console.log('Base: "%s", "%s", "%s"', sel, targetSelector, extendWith);
				// console.log('Extended copy:', _.invoke(selector.extend(sel, targetSelector, extendWith, {syntax: 'less'}), 'toString') );

				path[path.length - 1] += ', ' + extendWith + rulesLookup[targetSelector];
				// path[path.length - 1] = selector.extend(path[path.length - 1], targetSelector, extendWith, {syntax: 'less'});
				// console.log('Extended', path);
			}
		});
	}

	function sanitizeRule(rule) {
		var stream = stringStream(rule), ch;
		var ranges = [];

		while (ch = stream.next()) {
			if (ch == '"' || ch == "'") {
				stream.start = stream.pos - 1;
				if (stream.skipString(ch)) {
					ranges.push(range.create2(stream.start, stream.pos));
				} else {
					return '';
				}
			} else if (ch == ':' && stream.match(/^extend\s*\(/, false)) {
				stream.pos--;
				break;
			}
		}

		return utils.replaceWith(rule.substring(0, stream.pos), ranges, '!');
	}

	function extendInfo(rule) {
		rule = rule.toString();
		var sanitized = sanitizeRule(rule);
		return {
			clean: sanitized,
			original: rule,
			extend: rule.substr(sanitized.length) || '',
			noExtend: rule.substr(0, sanitized.length)
		};
	}

	/**
	 * Returns object with `from` and `to` indexes indicating
	 * part of `sel1` that fully matches `sel1
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

	function partialExtend(targetRules, extendWith, lookupItem) {
		var path = lookupItem.listItem.path;
		var resolvedPaths = selector.rules(_.last(path));
		// var rules = lookupItem.rules().map(extendInfo);
		var rules = lookupItem.rules().map(selector.create);
		// var extendWithInfo = extendInfo(extendWith);
		// 
		var exFragments = selector.create(extendWith).fragments();
		var exAppend = [];
		// move all `:extend()` frgaments to separate array
		for (var i = exFragments.length - 1; i >= 0; i--) {
			if (reExtend.test(exFragments[i])) {
				exAppend.unshift(exFragments.pop());
			} else {
				// no need to test further: `:extend` fragments must be
				// at the end of selector
				break;
			}
		}

		var exFragmentsStr = exFragments.join('');
		var exAppendStr = exAppend.join('');



		// console.log(extendWithInfo);

		_.each(targetRules, function(targetSelector) {
			targetSelector = selector.create(targetSelector);

			// console.log('selector', reSelector);

			rules.forEach(function(sel) {
				var ranges = [], offset = 0, m;

				while (m = matchedFragments(sel, targetSelector, offset)) {
					ranges.push(m);
					offset = m.to;
				}

				if (ranges.length) {
					var f1 = sel.fragments().slice(0);
					var f2 = targetSelector.fragments();
					for (var i = ranges.length - 1, r; i >= 0; i--) {
						r = ranges[i];
						f1.splice(r.from, r.to - r.from, exFragmentsStr);
					}

					var p = f1.join('') + exAppendStr;
					if (!_.include(resolvedPaths, p)) {
						resolvedPaths.push(p);
						// console.log(p);
					}
				}



				// var ranges = [], m;
				// while (m = reSelector.exec(sel.clean)) {
				// 	ranges.push([m.index + m[1].length, m.index + m[0].length]);
				// }

				// if (ranges.length) {
				// 	var p = utils.replaceWith(sel.original, ranges, extendWithInfo.noExtend, true) + extendWithInfo.extend;
				// 	if (!_.include(resolvedPaths, p)) {
				// 		resolvedPaths.push(p);
				// 		// console.log(p);
				// 	}
				// }





				// var m = reSelector.exec(item.clean);
				// console.log(item.clean, !!m);
				// if (m) {
				// 	var p = item.original.substring(0, m.index + m[1].length) 
				// 		+ extendWith 
				// 		+ item.original.substring(m.index + m[0].length);

				// 	if (!_.include(resolvedPaths, p)) {
				// 		resolvedPaths.push(p);
				// 		console.log(p);
				// 	}

				// 	// path[path.length - 1] += ', ' 
				// 	// 	+ item.original.substring(0, m.index + m[1].length) 
				// 	// 	+ extendWith 
				// 	// 	+ item.original.substring(m.index + m[0].length); 
				// }
			});
		});

		// console.log(resolvedPaths.join(', '));

		path[path.length - 1] = resolvedPaths.join(', ');
	}

	function cleanSelectorsLookup(listItem) {
		var path = listItem.path;
		return selector.rules(_.last(path)).map(stripExtend);
	}

	function simpleExtendNew(targetRules, extendWith, lookupItem) {
		extendWith = selector.create(extendWith);

		var path = lookupItem.listItem.path;
		var rulesLookup = {};
		cleanSelectorsLookup(lookupItem.listItem).forEach(function(item) {
			rulesLookup[item] = true;
		});

		var exCleanSel = selectorFragments(extendWith).fragments.join('');

		_.each(targetRules, function(targetSelector) {
			targetSelector = targetSelector.toString();
			// console.log('do simple extend "%s" with "%s', targetSelector, extendWith);
			if (targetSelector in rulesLookup && !(exCleanSel in rulesLookup)) {
				var path = lookupItem.listItem.path;
				rulesLookup[exCleanSel] = true;
				path[path.length - 1] += ', ' + exCleanSel;
			}
		});
	}

	function partialExtendNew(targetRules, extendWith, lookupItem) {
		extendWith = selector.create(extendWith);

		var path = lookupItem.listItem.path;
		var resolvedPaths = cleanSelectorsLookup(lookupItem.listItem);

		var exFragments = selectorFragments(extendWith);
		var exCleanSel = exFragments.fragments.join('');
		// var exExtend = exFragments.extend.join('');

		_.each(targetRules, function(targetSelector) {
			targetSelector = selector.create(targetSelector);

			var ranges = [], offset = 0, m;

			while (m = matchedFragments(lookupItem.fragments, targetSelector, offset)) {
				ranges.push(m);
				offset = m.to;
			}

			if (ranges.length) {
				var f1 = lookupItem.fragments.slice(0);
				var f2 = targetSelector.fragments();
				for (var i = ranges.length - 1, r; i >= 0; i--) {
					r = ranges[i];
					f1.splice(r.from, r.to - r.from, exCleanSel);
				}

				var p = f1.join('');
				if (!_.include(resolvedPaths, p)) {
					resolvedPaths.push(p);
				}
			}
		});

		// console.log(resolvedPaths.join(', '));

		path[path.length - 1] = resolvedPaths.join(', ');
	}

	return {
		reExtend: reExtend,
		resolveOld: function(list) {
			// console.log('Before', _.pluck(list, 'path'));

			if (!this.hasExtend(list)) {
				return list;
			}

			// extend selectors
			var toExtend = this.extendingSelectors(list);
			var lookup = lookupFactory.rulesLookup(list);
			var idLookup = lookupFactory.idLookup(list);
			var nestingLookup = null;

			// In LESS, the order of selectors to extend is not important:
			// selectors can extend each other and extended selectors can extend
			// others (with extended selector).
			// To keep tree’s selectors up-to-date after extention, we have to 
			// update `path` with extended selector so `RuleItem` and `ExtendItem`
			// lookups will return most recent values
			toExtend.forEach(function(ex) {
				var key = nestingKey(ex.listItem.path);
				var lookupItems = lookup;
				if (key) {
					if (!nestingLookup) {
						nestingLookup = createNestingLookup(lookup);
					}
					lookupItems = nestingLookup[key];
				}

				_.each(ex.extendWith(), function(extendWith) {
					var extendWithStr = extendWith.toString();
					_.each(ex.sel, function(sel) {





						_.each(lookupItems, function(l) {
							if (l.listItem === ex.listItem) {
								// self-referencing, ignore
								return;
							}

							if (!sel.all) {
								// requested exact match: run simplier and faster extend
								simpleExtend(sel.rules, extendWithStr, l, ex);
							} else {
								partialExtend(sel.rules, extendWith, l);
							}
						});
					});
				});
			});

			// console.log(_.pluck(list, 'path'));
			_.each(list, function(item) {
				item.path = removeExtendFromPath(item.path);
			});
			return list;
		},

		resolve: function(list) {
			if (!this.hasExtend(list)) {
				return list;
			}

			// extend selectors
			var extending = this.extendingSelectors(list);

			// In LESS, the order of selectors to extend is not important:
			// selectors can extend each other and extended selectors can extend
			// others (with extended selector).
			// To keep tree’s selectors up-to-date after extention, we have to 
			// update `path` with extended selector so `RuleItem` and `ExtendItem`
			// lookups will return most recent values
			extending.forEach(function(ex) {
				_.each(ex.extendWith(), function(extendWith) {
					var extendWithStr = extendWith.toString();
					_.each(ex.sel, function(sel) {
						console.log('In [%s] extend "%s" with "%s"', ex.toExtend.map(function(item) {
							return item.cleanSelector();
						}).join(', '), sel.sel, extendWithStr);
						_.each(ex.toExtend, function(l) {
							if (l.listItem === ex.listItem) {
								// self-referencing, ignore
								return;
							}
							if (!sel.all) {
								// requested exact match: run simplier and faster extend
								simpleExtendNew(sel.rules, extendWith, l);
							} else {
								partialExtendNew(sel.rules, extendWith, l);
							}
						});
					});
				});
			});

			// console.log(_.pluck(list, 'path'));
			_.each(list, function(item) {
				item.path = removeExtendFromPath(item.path);
			});
			return list;
		},

		/**
		 * Collects selectors from list that should extend other selectors
		 * @param  {Array} list
		 * @return {Array}
		 */
		extendingSelectors: function(list) {
			var result = [];
			var lookup = createLookup(list);
			var nestingLookup = null;

			var findToExtend = function(sel, all, toExtend, lookupItems) {
				sel = selector.create(sel);
				lookupItems.forEach(function(item) {
					if (item.matches(sel, !all)) {
						toExtend.push(item);
					}
				});
			};

			var item, innerSels, m, rules, rule;
			for (var i = 0, il = list.length; i < il; i++) {
				item = list[i];
				rules = selector.rules(_.last(item.path));

				var key = nestingKey(item.path);
				var lookupItems = lookup;
				if (key) {
					if (!nestingLookup) {
						nestingLookup = createNestingLookup(lookup);
					}
					lookupItems = nestingLookup[key];
				}

				for (var j = 0, jl = rules.length; j < jl; j++) {
					var toExtend = [];
					while (m = reExtendFull.exec(rules[j])) {
						var selData = {
							sel: m[1].trim(),
							all: !!m[2]
						};
						findToExtend(selData.sel, selData.all, toExtend, lookupItems);
						result.push(new ExtendItem(selData, item, toExtend));
					}
				}

				innerSels = this.collectInnerExtend(item.node);
				if (innerSels.length) {
					toExtend = [];
					innerSels.forEach(function(item) {
						findToExtend(item.sel, item.all, toExtend, lookupItems);
					});
					result.push(new ExtendItem(innerSels, item, toExtend, true));
				}
			}

			return result;
		},

		getExtendFromProperty: function(node) {
			if (node.type !== 'section' && node.name() == '&') {
				var m = node.value().match(reInnerExtend);
				if (m) {
					return m[1].trim();
				}
			}

			return null;
		},

		/**
		 * Check if current tree node contains extends defined in it
		 * as `&:extend(...)`
		 * @param  {CSSNode} node
		 * @return {Array}   List of extends found
		 */
		collectInnerExtendOld: function(node) {
			var out = [], innerExtend;
			for (var i = 0, il = node.children.length; i < il; i++) {
				if (innerExtend = this.getExtendFromProperty(node.children[i])) {
					out.push(innerExtend);
				}
			}

			return out;
		},

		/**
		 * Check if current tree node contains extends defined in it
		 * as `&:extend(...)`
		 * @param  {CSSNode} node
		 * @return {Array}   List of extends found
		 */
		collectInnerExtend: function(node) {
			var out = [], innerExtend;
			for (var i = 0, il = node.children.length, child; i < il; i++) {
				child = node.children[i];
				if (child.type !== 'section' && child.name() == '&') {
					var m = child.value().match(reInnerExtend);
					if (m) {
						out.push({
							sel: m[1].trim(),
							all: !!m[2]
						});
					}
				}
			}

			return out;
		},

		/**
		 * Fast test if list contains `:extend` instructions
		 * @param  {Array}  list Plain list of nodes
		 * @return {Boolean}
		 */
		hasExtend: function(list) {
			var item, children;
			for (var i = 0, il = list.length; i < il; i++) {
				item = list[i];
				if (reExtend.test(_.last(item.path))) {
					return true;
				}

				// check for `&:extend()` inside node (its children or content)
				children = item.node.children;
				for (var j = 0, jl = children.length; j < jl; j++) {
					if (this.getExtendFromProperty(children[j])) {
						return true;
					}
				}
			}

			return false;
		},
		stripExtend: stripExtend
	};
});