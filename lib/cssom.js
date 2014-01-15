/**
 * CSSOM patch mapper: maps incoming updates to browser’s 
 * CSS Object Model, which improves perceived performance.
 * Unfortunately, CSSOM changes in Chrome are not actually
 * reflected in Resource item source so this changes must
 * be backed with resource changing via Extensions API
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(module);
	};
}

define(function(module) {
	function toArray(obj) {
		return obj ? Array.prototype.slice.call(obj) : [];
	}

	function last(arr) {
		return arr[arr.length - 1];
	}

	function findStyleSheets(ctx, out) {
		out = out || {};
		for (var i = 0, il = ctx.length, url, item; i < il; i++) {
			item = ctx[i];
			url = item.href;
			if (url in out) {
				// stylesheet already added
				continue;
			}

			out[url] = item;
			
			// find @import rules
			if (item.cssRules) {
				for (var j = 0, jl = item.cssRules.length; j < jl; j++) {
					if (item.cssRules[j].type == 3) {
						findStyleSheets([item.cssRules[j].styleSheet], out);
					}
				}
			}
		}
		
		return out;
	}

	/**
	 * Returns name of given rule
	 * @param  {CSSRule} rule
	 * @return {String}
	 */
	function ruleName(rule) {
		/*
		 * Reference:
		 * UNKNOWN_RULE: 0
		 * STYLE_RULE: 1
		 * CHARSET_RULE: 2
		 * IMPORT_RULE: 3
		 * MEDIA_RULE: 4
		 * FONT_FACE_RULE: 5
		 * PAGE_RULE: 6
		 * KEYFRAMES_RULE: 7
		 * KEYFRAME_RULE: 8
		 * SUPPORTS_RULE: 12
		 * WEBKIT_FILTER_RULE: 17
		 * HOST_RULE: 1001
		 */
		var sel = rule.selectorText;
		if (sel) {
			return sel;
		}

		switch (rule.type) {
			case 2: return '@charset';
			case 3: return '@import';
			case 4: return '@media ' + rule.media.mediaText;
			case 5: return '@font-face';
		}

		var text = rule.cssText;
		if (text) {
			return (text.split('{', 2)[0] || '').trim();
		}
	}

	/**
	 * @param {CSSNode} node
	 * @returns {Array}
	 */
	function pathComponentForRule(rule) {
		var name = ruleName(rule);
		if (!name) {
			return null;
		}
		var siblings = parent(rule).cssRules;
		var pos = 1;

		for (var i = 0, il = siblings.length; siblings[i] !== rule && i < il; i++) {
			if (ruleName(siblings[i]) === name) {
				pos++;
			}
		}

		return [name, pos];
	}

	/**
	 * Returns location path for give CSS rule
	 * @param  {CSSRule} rule
	 * @return {Array}
	 */
	function pathForRule(rule) {
		var mainComponent = pathComponentForRule(rule);
		if (!mainComponent) {
			return null;
		}

		var parts = [mainComponent];
		while(rule = rule.parentRule) {
			parts.unshift(pathComponentForRule(rule));
		}

		return parts;
	}

	/**
	 * Returns rule’s index in parent stylesheet/rule
	 * @param  {CSSRule} rule
	 * @return {Number}
	 */
	function index(rule) {
		return toArray(parent(rule).cssRules).indexOf(rule);
	}

	/**
	 * Returns rule’s parent (stylesheet or rule)
	 * @param  {CSSRule} rule
	 * @return {CSSStyleSheet}
	 */
	function parent(rule) {
		return rule.parentRule || rule.parentStyleSheet;
	}

	/**
	 * Returns camel-cased version of CSS property name
	 * @param  {String} name
	 * @return {String}
	 */
	function camelize(name) {
		name = name.replace(/-([a-z])/g, function(str, p1) {
			return p1.toUpperCase();
		});

		return name.charAt(0).toLowerCase() + name.substr(1);
	}

	/**
	 * Updates given rule with data from patch
	 * @param  {CSSRule} rule
	 * @param  {Array} patch
	 */
	function patchRule(rule, patch) {
		if ('value' in patch) {
			// updating full value of section, like `@import`
			return patchRuleByValue(rule, patch);
		}

		// update properties
		rule.style.cssText += patch.properties.map(function(prop) {
			return prop.name + ':' + prop.value + ';';
		}).join('');

		// remove properties
		patch.removed.forEach(function(prop) {
			rule.style[camelize(prop)] = '';
		});
	}

	function patchRuleByValue(rule, patch) {
		rule.cssText = ruleName(rule) + ' ' + patch.value;
	}

	/**
	 * Locates CSS section by given selectors in sections
	 * list
	 * @param  {Array} list Plain list of available sections
	 * @param  {String} sel  Selector to find
	 * @return {Object}
	 */
	function locate(list, sel) {
		var key = stringifyPath(sel, false);
		for (var i = 0, il = list.length, item; i < il; i++) {
			if (list[i].pathString == key) {
				return list[i].section;
			}
		}
	}

	/**
	 * Creates string representation of CSS path
	 * @param  {Array} path
	 * @return {String}
	 */
	function stringifyPath(path) {
		var out = '';
		for (var i = 0, il = path.length, p; i < il; i++) {
			p = path[i];
			out += (i ? '/' : '') + p[0] + (p[1] > 1 ? '|' + p[1] : '');
		}
		return out;
	}

	function guessLocation(stylesheet, path) {
		var part, rule, ruleList, candidates;
		var options = {skipNested: true};
		var ctx = stylesheet;

		var find = function(collection, path) {
			if (Array.isArray(path)) path = path[0];
			return collection.filter(function(item) {
				return ruleName(item.section) == path;
			});
		};

		while (part = path.shift()) {
			ruleList = module.exports.toList(ctx, options);
			rule = locate(ruleList, [part]);
			if (!rule) {
				candidates = find(ruleList, part);
				if (candidates.length) {
					if (path[0]) {
						// try to find last node containing
						// next child
						rule = last(candidates.filter(function(item) {
							return find(module.exports.toList(item.section), path[0]).length;
						}));
					}

					if (!rule) {
						rule = last(candidates).section;
					} else {
						rule = rule.section;
					}
				}
			}

			if (!rule) { // nothing found, stop here
				path.unshift(part);
				break;
			} else {
				ctx = rule;
			}
		}

		return {
			found: ctx !== stylesheet,
			rule: ctx,
			rest: path.length ? path : null
		};
	}

	/**
	 * Tries to find best partial match of given path on CSS tree and returns
	 * target section
	 * @param  {CSSRule} rule CSS tree
	 * @param  {Array} cssPath Parsed CSS path
	 */
	function bestPartialMatch(stylesheet, cssPath, patch) {
		var loc = guessLocation(stylesheet, cssPath);
		if (parent(loc.rule)) {
			var ctxName = ruleName(loc.rule).toLowerCase();
			if (ctxName == '@import' && patch.action == 'add') {
				// in case of added @import rule, make sure it was added,
				// not replaced existing rule
				if (!loc.rest) {
					loc.rest = [];
				}

				loc.rest.unshift([ctxName]);
				loc.rule = parent(loc.rule);
			}
		}

		ctx = loc.rule;

		if (loc.rest) {
			// The `rest` property means we didn’t found exact section
			// where patch should be applied, but some of its parents.
			// In this case we have to re-create the `rest` sections
			// in best matching parent
			var subrule, ix;
			while (subrule = loc.rest.shift()) {
				if (!ctx.insertRule) {
					// can’t insert rule here, so can’t patch the source properly
					return;
				}
				ix = ctx.insertRule(subrule[0] + ' {}', ctx.cssRules.length);
				ctx = ctx.cssRules[ix];
			}
		}

		patchRule(ctx, patch);
	}

	function makeList(items, options, out) {
		out = out || [];
		if (!items || !items.length) {
			return out;
		}

		for (var i = 0, il = items.length, rule; i < il; i++) {
			rule = items[i];
			out.push(rule);
			if (!options.skipNested && ('cssRules' in rule)) {
				makeList(rule.cssRules, options, out);
			}
		}

		return out;
	}

	function mapList(rule) {
		// var path = pathForRule(rule);
		var path = [['body', 1]];
		return {
			path: path,
			pathString: stringifyPath(path),
			section: rule
		};
	}

	function makeListFromIndex(items, out) {
		out = out || [];
		if (!items || !items.length) {
			return out;
		}

		for (var i = 0, il = items.length, item; i < il; i++) {
			out.push(items[i]);
			if (items[i].children) {
				makeListFromIndex(items[i].children, out);
			}
		}

		return out;
	}

	return module.exports = {
		/**
		 * Returns hash with available stylesheets. The keys of hash
		 * are absolute urls and values are pointers to StyleSheet objects
		 * @return {Object
		 */
		stylesheets: function() {
			return findStyleSheets(document.styleSheets);
		},

		/**
		 * Returns plain list of all available rules in stylesheet
		 * @param  {CSSStyleSheet} stylesheet
		 * @return {Array}
		 */
		toList: function(stylesheet, options) {
			options = options || {};
			return makeList(stylesheet.cssRules, options).map(mapList);
		},

		/**
		 * Updates given stylesheet with patches
		 * @param  {CSSStyleSheet} stylesheet
		 * @param  {Array} patches
		 */
		patch: function(stylesheet, patches) {
			console.profile('CSSOM Stylesheets');
			var that = this;
			if (typeof stylesheet == 'string') {
				stylesheet = this.stylesheets()[stylesheet];
			}
			console.profileEnd('CSSOM Stylesheets');

			if (!stylesheet || !stylesheet.cssRules) {
				console.log('No stylesheet');
				return false;
			}

			console.profile('CSSOM list');
			var index = this.createIndex(stylesheet);
			var ruleList = this.toList(stylesheet);
			console.profileEnd('CSSOM list');

			console.profile('CSSOM patch');
			patches.forEach(function(patch) {
				var cssPath = patch.path;
				var section = locate(ruleList, cssPath);

				if (patch.action === 'remove') {
					if (section) {
						parent(section).deleteRule(index(section));
					}

					return;
				}

				if (!section) {
					console.log('No section');
					bestPartialMatch(stylesheet, cssPath, patch);
				} else {
					console.log('Section found', patch);
					patchRule(section, patch);
				}
			});

			console.profileEnd('CSSOM patch');

			return true;
		},
		createIndex: function(ctx, parent) {
			var lookup = {};
			var rules = ctx.cssRules;
			var rule, name, item, path;
			var out = [];
			for (var i = 0, il = rules.length; i < il; i++) {
				rule = rules[i];
				name = ruleName(rule);
				if (name in lookup) {
					lookup[name]++;
				} else {
					lookup[name] = 1;
				}

				path = parent ? parent.path.slice(0) : [];
				path.push([name, lookup[name]]);

				item = {
					name: name,
					path: path,
					pathString: stringifyPath(path),
					parent: parent,
					ref: rule
				};

				if ('cssRules' in rule) {
					item.children = this.createIndex(rule, item);
				}

				out.push(item);
			}

			return out;
		}

	};
});