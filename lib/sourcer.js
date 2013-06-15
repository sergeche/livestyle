define(['lodash', 'tree', 'locator'], function(_, tree, locator) {
	if (typeof emmet == 'undefined') {
		try {
			emmet = require('vendor/emmet');
		} catch(e) {}
	}

	var defaultStyle = {
		// TODO read default style from preferences
		selSep: ' ',
		sectionSep: '\n',
		indent: '\n\t',
		sep: ': ',
		end: '\n'
	};

	/**
	 * Parses JSON, if required
	 * @param  {Object} data
	 * @return {Object}
	 */
	function pj(data) {
		return _.isString(data) ? JSON.parse(data) : data;
	}

	/**
	 * Creates new CSS section (rule) with given name (selector)
	 * and content
	 * @param  {String} name    Section name
	 * @param  {String} value   Section content
	 * @param  {Object} style   Formatting options
	 * @return {String}
	 */
	function createSection(name, value, style) {
		// TODO: learn the following:
		// * Formatting for media queries
		return name + style.selSep + '{' + style.indent + value + style.end + '}';
	}

	/**
	 * Removes comments from CSS token
	 * @param  {String} str
	 * @return {String}
	 */
	function cleanUp(str) {
		return str.replace(/\s?\/\*.*?\*\//g, '');
	}

	/**
	 * Tries to guess indentation for new sections/properties
	 * in given CSS node
	 * @param  {CSSNode} node
	 * @return {Object}
	 */
	function learnStyle(node) {
		var cssDOM;
		var style = _.clone(defaultStyle);

		if (node.type == 'property') {
			node = node.parent;
		}

		while (node && node.parent && !node.children.length) {
			node = _.find(node.parent.children, function(n) {
				return !!n.children.length;
			}) || node.parent;
		}

		if (!node.parent) {
			// node not found, pick the first one
			node = _.find(node.children, function(n) {
				return !!n.children.length;
			});
		}

		if (node && node.parent) {
			style.selSep = node.rawName().match(/([\s\n\r]+)$/) ? RegExp.$1 : '';
			try {
				cssDOM = emmet.require('cssEditTree').parse(node.toSource());
			} catch (e) {}
		}

		if (cssDOM) {
			var lastElem = _.last(cssDOM.list());
			style.indent = lastElem.styleBefore;
			style.sep = lastElem.styleSeparator;
			style.end = cssDOM.source.substring(lastElem.fullRange().end, cssDOM.source.length - 1);
		}

		return style;
	}

	/**
	 * Removes specified properties from CSS edit tree (rule)
	 * @param  {CSSEditTree} rule
	 * @param  {Array} properties 
	 */
	function removePropertiesFromRule(rule, properties) {
		if (!properties || !properties.length) {
			return;
		}

		properties
			.sort(function(a, b) {
				return b.index - a.index;
			})
			.forEach(function(p) {
				if ('index' in p) {
					var rp = rule.get(p.index);
					if (rp && rp.name() == p.name) {
						return rule.remove(rp);
					}
				}

				rule.getAll(p.name).reverse().forEach(function(rp) {
					rule.remove(rp);
				});
			});
	}

	/**
	 * Helper function to create CSS tree from given source
	 * @param  {Object} source CSS source. Can be a string or parsed tree
	 * @return {CSSNode}
	 */
	function makeTree(source) {
		return _.isString(source) ? tree.build(source) : source;
	}

	function pjson(p, addIndex) {
		var out = {
			name: p.name(),
			value: p.value()
		};

		if (addIndex) {
			var parent = p.parent;
			if ('indexOf' in parent) {
				out.index = parent.indexOf(p);
			} else if ('children' in parent) {
				out.index = _.indexOf(parent.children, p);
			}
		}

		return out;
	}

	return {
		/**
		 * Creates patch object for given character position
		 * in CSS source. This method can either compare 2 CSS sources
		 * and find difference (works for browser updates; more accurate) or
		 * find matched property in <code>source1</code> under given
		 * <code>pos</code> character index
		 * @param  {String} source1 CSS source
		 * @param  {String} source2 Updated CSS source
		 * @param  {Number} pos    Caret position inside source
		 * @return {Object}        Updated payload
		 */
		makePatch: function(source1, source2, pos) {
			var updated = [], removed = [], section;
			var cssTree = makeTree(source1);
			if (_.isString(source2)) {
				if (pos === void 0) {
					pos = this.diffPoint(source1, source2);
				}

				var upd = this.compareSections(source1, source2, pos);
				updated = updated.concat(upd.added, upd.updated);
				removed = upd.removed;
				section = locator.locateByPos(cssTree, pos);
				if (section.type == 'property') {
					section = section.parent;
				}
			} else {
				pos = _.last(arguments);
				var rule = emmet.require('cssEditTree').parseFromPosition(cssTree.source, pos, true);
				if (!rule) {
					return null;
				}

				section = locator.locateByPos(cssTree, rule.nameRange(true).start);
				var prop = rule.itemFromPosition(pos, true);
				if (prop && prop.nameRange(true).start == pos) {
					// do not update property if it’s name range start
					// matches search position:
					// most likely, it’s update coming from source
					// where all properties are whitten on single line,
					// e.g. like in this case: `position:relative;|top:10px`
					prop = null;
				}

				updated = _.map(prop ? [prop] : rule.list(), function(p) {
					return pjson(p, true);
				});
			}

			return {
				path: locator.createPath(section),
				properties: updated,
				removed: removed
			};
		},

		/**
		 * Condenses list of patches: merges multiple patches for the same 
		 * selector into a single one and tries to reduce operations.
		 * The order of patches is very important since it affects the list
		 * of updates applied to source code
		 * @param {Array} patches
		 * @return {Array}
		 */
		condensePatches: function(patches) {
			var byPath = {};
			var find = function(collection, propName) {
				for (var i = 0, il = collection.length; i < il; i++) {
					if (collection[i].name === propName) {
						return collection[i];
					}
				};
			};

			_.each(patches, function(patch) {
				var path = locator.stringifyPath(patch.path);
				if (!(path in byPath)) {
					byPath[path] = [];
				}

				byPath[path].push(patch);
			});

			return _.map(byPath, function(list, path) {
				var p = _.cloneDeep(list[0]);
				_.each(_.rest(list), function(patch) {
					p.removed = _.filter(p.removed, function(item) {
						return !find(patch.properties, item.name);
					});

					p.properties = p.properties.concat(_.filter(patch.properties, function(item) {
						var origItem = find(p.properties, item.name);
						if (origItem) {
							origItem.value = item.value;
							return false;
						}

						return true;
					}));

					p.removed = p.removed.concat(_.filter(patch.removed, function(item) {
						return !find(p.removed, item.name);
					}));
				});
				return p;
			});
		},

		/**
		 * Applies patch, created by <code>makePatch()</code> methon,
		 * to given CSS source.
		 * Patching is used for sources that don’t need formatting
		 * inderitance (e.g. browsers)
		 * @param  {String} source CSS source
		 * @param  {Object} patch  Update payload
		 */
		patchedRanges: function(source, patch) {
			patch = pj(patch);
			var cssTree;
			if (_.isString(source)) {
				cssTree = tree.build(source);
			} else {
				cssTree = source;
				source = cssTree.source;
			}

			var cssPath = locator.parsePath(patch.path);
			var style = defaultStyle;
			var rule, ruleSource, updateRange, updateValue, loc;

			var section = locator.locate(cssTree, cssPath);
			if (!section) {
				loc = locator.guessLocation(cssTree, cssPath);
				if (loc.rest) {
					// incomplete match, create new section
					style = learnStyle(loc.node);
					ruleSource = createSection(loc.rest.pop()[0], '', _.defaults({indent: ''}, style));
					var updPos = loc.node.parent ? loc.node.range().end - 1 : source.length;
					updateRange = [updPos, updPos];
				} else {
					section = loc.node;
				}
			}

			if (section) {
				ruleSource = section.toSource();
				updateRange = section.range().toArray();
				style = learnStyle(section);
			}

			rule = emmet.require('cssEditTree').parse(ruleSource, {
				styleBefore: style.indent,
				styleSeparator: style.sep
			});
			var out = [], toInsert = [];

			removePropertiesFromRule(rule, patch.removed);

			patch.properties.forEach(function(prop) {
				var ruleProp;
				if ('index' in prop) {
					ruleProp = rule.get(prop.index);
					if (!ruleProp || ruleProp.name() != prop.name) {
						ruleProp = _.last(rule.getAll(prop.name));
					}
				}

				var changedProps = ruleProp ? [ruleProp] : rule.getAll(prop.name);
				if (changedProps.length) {
					changedProps.forEach(function(rp) {
						out.push([rp.valueRange().start, rp.valueRange().end, prop.value]);
					});
				} else {
					toInsert.push(prop);
				}
			});

			// squash all inserted properties into single payload
			if (toInsert.length) {
				var first = toInsert.shift();
				// if last rule doe not contains semi-colon, 
				// we have to remember it and add to final payload
				var lastRuleProp = _.last(rule.list());
				var lastEnd = lastRuleProp ? lastRuleProp.end() : '';

				var firstInserted = rule.add(first.name, first.value);
				var lastInserted = firstInserted;
				toInsert.forEach(function(prop) {
					lastInserted = rule.add(prop.name, prop.value);
				});

				var updPos = firstInserted.fullRange().start;
				if (lastRuleProp && lastRuleProp.end() !== lastEnd) {
					updPos -= lastRuleProp.end().length;
				}

				out.push([updPos, updPos,
					rule.source.substring(updPos, lastInserted.fullRange().end)
				]);
			}

			// update ranges to match source
			out.forEach(function(p) {
				p[0] += updateRange[0];
				p[1] += updateRange[0];
			});
			
			// removing properties or adding new section, remove all other updates
			if (patch.removed.length || (loc && loc.rest)) {
				var src = rule.source;
				if (loc && loc.rest) {
					var padding = style.indent.match(/([ \t]+)$/) ? RegExp.$1 : '';
					var utils = emmet.require('utils');
					while (loc.rest.length) {
						src = createSection(loc.rest.pop()[0], utils.padString(src, padding), style);
					}
				}
				
				var before = updateRange[0] ? style.sectionSep : '';
				out = [updateRange.concat([before + src])];
			}

			return out.sort(function(a, b) {
				return a[0] > b[0];
			});
		},

		/**
		 * Applies patch, created by <code>makePatch()</code> methon,
		 * to given CSS source.
		 * @param  {String} source CSS source
		 * @param  {Object} patch  Update payload
		 */
		applyPatch: function(source, patch) {
			var sourceStr = _.isString(source) ? source : source.source;
			if (!_.isArray(patch)) {
				patch = [patch];
			}

			patch.forEach(function(p) {
				var ranges = this.patchedRanges(source, p);
				ranges.reverse();
				ranges.forEach(function(r) {
					sourceStr = sourceStr.substring(0, r[0]) + r[2] + sourceStr.substring(r[1]);
				});

				source = sourceStr;
			}, this);

			return source;
		},

		/**
		 * Locates character index where <code>source1</code> differs from
		 * <code>source2</code>. This method can be used for browser sources
		 * only, where difference occurs in the same rule
		 * @param  {String} source1
		 * @param  {String} source2
		 * @return {Number}
		 */
		diffPoint: function(source1, source2) {
			// using highly-optimized loop
			for (var i = 0, j; j = source1[i]; i++) {
				if (j !== source2[i]) {
					return i;
				}
			}

			return -1;
		},

		/**
		 * Compares sections in both sources at given position
		 * and returns object with added and removed properties.
		 * This is an utility function used mostly by browsers
		 * to determine difference between original and updated 
		 * rules at given position (e.g. from regular diff patch).
		 * 
		 * @param  {String} source1 Original CSS source
		 * @param  {String} source2 Updates CSS source
		 * @param  {Number} pos     Character index where to search CSS rule. 
		 * If it’s not specified, <code>diffPoint()</code> method will be
		 * used
		 * @return {Object}
		 */
		compareSections: function(source1, source2, pos) {
			if (pos === void 0) {
				pos = this.diffPoint(source1, source2);
			}

			if (pos == -1) {
				throw new Error('Unable to compare sources');
			}

			var cssEditTree = emmet.require('cssEditTree');
			var source1Range = cssEditTree.extractRule(source1, pos, true);
			var source2Range = cssEditTree.extractRule(source2, pos, true);
			if (!source1Range || !source2Range) {
				return;
			}

			var tree1 = tree.build(source1Range.substring(source1)).children[0];
			var tree2 = tree.build(source2Range.substring(source2)).children[0];
			var ch1 = tree1.children;
			var ch2 = tree2.children;
			var added = [], updated = [], removed = [];
			var lookupIx = 0;

			ch2.forEach(function(ch, i) {
				var op = ch1[lookupIx];
				if (!op) {
					// property was added at the end
					return added.push(pjson(ch));
				}

				if (ch.name() == op.name()) {
					++lookupIx;
					if (ch.value() != op.value()) {
						// same property, different value:
						// the property was updated
						// TODO check for edge cases with vendor-prefixed values
						updated.push(pjson(ch));
					}

					return;
				}

				// look further for property with the same name
				for (var nextIx = lookupIx + 1, il = ch1.length; nextIx < il; nextIx++) {
					if (ch1[nextIx].name() == ch.name() && ch1[nextIx].value() == ch.value()) {
						removed = removed.concat(ch1.slice(lookupIx, nextIx).map(function(p) {
							return pjson(p, true);
						}));
						lookupIx = nextIx + 1;
						return;
					}
				}

				// if we reached this point then the current property
				// was added to source2
				added.push(pjson(ch));
			});

			removed = removed.concat(ch1.slice(lookupIx, ch1.length).map(function(p) {
				return pjson(p, true);
			}));

			return {
				added: added,
				updated: updated,
				removed: removed
			};
		}
	};
});