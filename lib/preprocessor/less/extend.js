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
	var reInnerExtend = /^extend\s*\((.+?)\)/;
	var reAll = /\s+all$/;

	function ExtendItem(sel, listItem, all) {
		this.sel = sel;
		this.listItem = listItem;
		// this.node = listItem.node;
		this._selCache = null;
		this._selCacheKey = null;
		this._all = !!all;
		// this._all = true;
	}

	ExtendItem.prototype = {
		extendWith: function() {
			var sel = _.last(this.listItem.path);
			// if we have cached value, validate it first
			if (this._selCache !== null && this._selCacheKey === sel) {
				return this._selCache;
			}

			this._selCacheKey = sel;

			var rules = selector.rules(sel);
			if (!this._all) {
				var re = new RegExp(':extend\\s*\\(\\s*' + this.sel + '\\s*\\)');
				rules = rules.filter(function(rule) {
					return re.test(rule);
				});
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

	function partialExtend(targetRules, extendWith, lookupItem) {
		var path = lookupItem.listItem.path;
		var resolvedPaths = selector.rules(_.last(path));
		var rules = lookupItem.rules().map(extendInfo);
		var extendWithInfo = extendInfo(extendWith);

		// console.log(extendWithInfo);

		_.each(targetRules, function(targetSelector) {
			var reSelector = new RegExp(
				(/^[\w\-]/.test(targetSelector.charAt(0))  ? '^' : '(^|\\b|\\s)') 
				+ utils.escapeForRegexp(targetSelector) 
				+ '(\\b|$)', 'g');

			// console.log('selector', reSelector);

			rules.forEach(function(item) {
				var ranges = [], m;
				while (m = reSelector.exec(item.clean)) {
					ranges.push([m.index + m[1].length, m.index + m[0].length]);
				}

				if (ranges.length) {
					var p = utils.replaceWith(item.original, ranges, extendWithInfo.noExtend, true) + extendWithInfo.extend;
					if (!_.include(resolvedPaths, p)) {
						resolvedPaths.push(p);
						// console.log(p);
					}
				}





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

	return {
		reExtend: reExtend,
		resolve: function(list) {
			// console.log('Before', _.pluck(list, 'path'));

			if (!this.hasExtend(list)) {
				return list;
			}

			// extend selectors
			var toExtend = this.selectorsToExtend(list);
			var lookup = lookupFactory.rulesLookup(list);
			var nestingLookup = null;

			// console.log(toExtend);

			// In LESS, the order of selectors to extend is not important:
			// selectors can extend each other and extended selectors can extend
			// others (with extended selector).
			// To keep tree’s selectors up-to-date after extention, we have to 
			// update `path` with extended selector so `RuleItem` and `ExtendItem`
			// lookups will return most recent values
			_.each(toExtend, function(ex, i) {
				var sel = ex.sel.replace(reAll, '');
				var all = ex.sel !== sel;
				var options = {syntax: 'less'};
				var targetRules = selector.rules(sel, true);

				var key = nestingKey(ex.listItem.path);
				var lookupItems = lookup;
				if (key) {
					if (!nestingLookup) {
						nestingLookup = createNestingLookup(lookup);
					}
					lookupItems = nestingLookup[key];
				}

				_.each(ex.extendWith(), function(extendWith) {
					// console.log('Extend "%s" with "%s" (%s)', sel, extendWith, all);
					var extendWithStr = extendWith.toString();
					_.each(lookupItems, function(l) {
						if (l.listItem === ex.listItem) {
							// self-referencing, ignore
							return;
						}

						if (!all) {
							// requested exact match: run simplier and faster extend
							simpleExtend(targetRules, extendWithStr, l, ex);
						} else {
							partialExtend(targetRules, extendWith, l);
							// requested partial match
							// _.each(targetRules, function(targetSelector) {
							// 	// console.log('extending "%s" with "%s" (%s)', _.invoke(l.rules(), 'toString'), extendWith.toString(), extendWithStr);
							// 	var rules = selector.extend(l.rules(), targetSelector, extendWith, options);
							// 	var path = l.listItem.path;
							// 	path[path.length - 1] = _.invoke(rules, 'toString').join(', ');
							// });
						}
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
		 * Collects selectors from list that should be extended
		 * @param  {Array} list
		 * @return {Array}
		 */
		selectorsToExtend: function(list) {
			var result = [];

			var item, nodeName, sels = [], innerSels, m, rules, rule;
			for (var i = 0, il = list.length; i < il; i++) {
				item = list[i];
				nodeName = _.last(item.path);
				sels.length = 0;

				rules = selector.rules(nodeName);
				// console.log('rules', rules);
				for (var j = 0, jl = rules.length; j < jl; j++) {
					// rule = stripExtend(rules[j]);
					while (m = reExtend.exec(rules[j])) {
						sels.push({
							sel: m[1].trim(),
							all: false
							// listItem: item,
							// extendWith: rule
						});
					}
				}

				innerSels = this.collectInnerExtend(item.node);
				// rule = _.last(item.path);
				for (var j = 0, jl = innerSels.length; j < jl; j++) {
					sels.push({
						sel: innerSels[j],
						all: true
						// listItem: item,
						// extendWith: rule
					});
				}

				// console.log('sels', sels);

				// sels = _.uniq(sels, 'sel');

				// result = result.concat(sels);

				for (var j = 0, jl = sels.length; j < jl; j++) {
					// sels[j].extendWith = selector.rules(sels[j].extendWith, true);
					result.push(new ExtendItem(sels[j].sel, item, sels[j].all));
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
		collectInnerExtend: function(node) {
			var out = [], innerExtend;
			for (var i = 0, il = node.children.length; i < il; i++) {
				if (innerExtend = this.getExtendFromProperty(node.children[i])) {
					out.push(innerExtend);
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