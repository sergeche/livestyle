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

	return {
		/**
		 * Creates patch object for given character position
		 * in CSS source
		 * @param  {String} source CSS source
		 * @param  {Number} pos    Caret position inside source
		 * @return {Object}        Updated payload
		 */
		makePatch: function(source, pos) {
			var cssTree = _.isString(source) ? tree.build(source) : source;
			var rule = emmet.require('cssEditTree').parseFromPosition(cssTree.source, pos, true);
			if (!rule) {
				return null;
			}
			
			var section = locator.locateByPos(cssTree, rule.nameRange(true).start);
			var prop = rule.itemFromPosition(pos, true);
			if (prop && prop.nameRange(true).start == pos) {
				// do not update property if it’s name range start
				// matches search position:
				// most likely, it’s update coming from source
				// where all properties are whitten on single line,
				// e.g. like in this case: `position:relative;|top:10px`
				prop = null;
			}

			var values = {};

			_.each(prop ? [prop] : rule.list(), function(item) {
				values[item.name()] = item.value();
			});

			return {
				path: locator.createPath(section),
				properties: _.map(prop ? [prop] : rule.list(), function(item) {
					return {
						name: item.name(),
						value: item.value(),
						index: rule.indexOf(item)
					};
				})
			};
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

			var cssTree = tree.build(source);
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
			
			// adding new section, remove all other updates
			if (loc && loc.rest) {
				var padding = style.indent.match(/([ \t]+)$/) ? RegExp.$1 : '';
				var utils = emmet.require('utils');
				var src = rule.source;
				while (loc.rest.length) {
					src = createSection(loc.rest.pop()[0], utils.padString(src, padding), style);
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
			var ranges = this.patchedRanges(source, patch);
			ranges.reverse();
			ranges.forEach(function(r) {
				source = source.substring(0, r[0]) + r[2] + source.substring(r[1]);
			});

			return source;
		}
	};
});