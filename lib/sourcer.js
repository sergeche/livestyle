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
	 * Returns editor payload with updated value of given CSS
	 * node
	 * @param  {CSSNode} node  Node to update
	 * @param  {String} value New node value
	 * @return {String} JSON payload for editor
	 */
	function updateTreeNode(node, value) {
		var oldValue = node.rawValue();
		var start = node.valueRange.start;
		var end = node.valueRange.end;
		// adjust start position to keep formatting
		if (/^(\s+)/.test(oldValue)) {
			start += RegExp.$1.length;
		}
		if (/(\s+)$/.test(oldValue)) {
			end -= RegExp.$1.length;
		}

		return {
			range: [start, node.valueRange.end],
			value: value
		};
	}

	/**
	 * Tries to guess node loction in CSS by given path
	 * and update it accordingly. If direct node wasn't found,
	 * tries to create it
	 * @param  {CSSNode} cssTree Parsed CSS tree
	 * @param  {Object} payload Browser data payload
	 * @return {Object}
	 */
	function guessAndUpdateCSS(cssTree, payload) {
		var loc = locator.guessLocation(cssTree, payload.path);
		if (!loc.rest) {
			// found property to update
			return updateTreeNode(loc.node, payload.value);
		}

		if (loc.rest.length == 1) {
			// found container but without value, 
			// let’s create it
			var nodeRange = loc.node.range();
			var editTree = emmet.require('cssEditTree').parse(loc.node.toSource(), {
				offset: nodeRange.start
			});
			var newProp = editTree.add(loc.rest[0][0], payload.value);
			return {
				range: nodeRange.toArray(),
				value: editTree.source,
				sel: newProp.range(true).toArray()
			};
		}

		// Path partially matched, but we have to re-create
		// all sections
		var style = learnStyle(loc.node);
		var padding = style.indent.match(/([ \t]+)$/) ? RegExp.$1 : '';
		var utils = emmet.require('utils');

		var prop = _.last(loc.rest);
		var sections = _.initial(loc.rest);
		var propSection = sections.pop();

		// create deepest section with CSS property
		var section = createSection(propSection[0], prop[0] + style.sep + payload.value + ';', style);

		// recursively create all nested sections
		while (sections.length) {
			section = createSection(sections.pop()[0], utils.padString(section, padding), style);
		}

		var r = loc.node.range();
		var before = style.sectionSep;
		return {
			range: [r.end, r.end],
			value: (r.end ? before : '') + section,
			sel: [r.end + before.length, r.end + before.length + section.length]
		};
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
	 * Updates value of given node with new one
	 * @param  {CSSNode} node 
	 * @param  {Object} value
	 */
	function updateValue(node, value) {
		if (node.type == 'property') {
			var upd = updateTreeNode(node, value);
			return {
				start: upd.range[0],
				end: upd.range[1],
				value: value + ''
			}
		} else if (_.isObject(value)) {
			// updating values of CSS section
			var rule = emmet.require('cssEditTree').parse(node.toSource());
			_.each(value, function(v, k) {
				var props = rule.getAll(k);
				if (props.length) {
					// update values of all properties with the same 
					// name in order to visually apply changes
					props.forEach(function(p) {
						p.value(v);
					})
				} else {
					// no such CSS property, add it
					rule.add(k, v);
				}
			});

			var r = node.range();
			return {
				start: r.start,
				end: r.end,
				value: rule.source
			};
		}
	}

	return {
		/**
		 * Updates given CSS file content with payload (CSS delta)
		 * @param  {String} content CSS file to patch
		 * @param  {Object} payload Update payload
		 * @return {Object} Object with updated part of source
		 */
		update: function(content, payload) {
			if (_.isString(payload)) {
				payload = JSON.parse(payload);
			}

			var cssTree = _.isString(content) ? tree.build(content) : content;
			var cssPath = payload.path;
			if (_.isString(cssPath)) {
				cssPath = JSON.parse(cssPath);
			}

			var node = locator.locate(cssTree, cssPath);
			if (node && node.type == 'property') {
				// direct hit, simply update value range
				return updateTreeNode(node, payload.value);
			}

			return guessAndUpdateCSS(cssTree, payload);
		},

		/**
		 * Creates patch object for given character position
		 * in CSS source
		 * @param  {String} source CSS source
		 * @param  {Number} pos    Caret position inside source
		 * @return {Object}        Updated payload
		 */
		makePatch: function(source, pos) {
			var rule = emmet.require('cssEditTree').parseFromPosition(source, pos, true);
			if (!rule) {
				return null;
			}

			var cssTree = tree.build(source);
			var section = locator.locateByPos(cssTree, rule.nameRange(true).start);
			var prop = rule.itemFromPosition(pos, true);
			if (prop && prop.nameRange(true).start == pos) {
				// do not update property if it’s name range start
				// matches search position:
				// most likely, it’s update coming from source
				// where all properties are whitten on single line,
				// e.g. like this: `position:relative;|top:10px`
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
						value: item.value()
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
		applyPatch: function(source, patch) {
			patch = pj(patch);

			var cssTree = tree.build(source);
			var cssPath = locator.parsePath(patch.path);
			var cssEditTree = emmet.require('cssEditTree');

			var rule, ruleSource, updateRange, updateValue;
			var prependSections = [];

			var section = locator.locate(cssTree, cssPath), loc;
			if (!section) {
				loc = locator.guessLocation(cssTree, cssPath);
				if (loc.rest) {
					// incomplete match, create new section
					ruleSource = createSection(loc.rest.pop()[0], '', defaultStyle);
					var updPos = loc.node.parent ? loc.node.range().end - 1 : source.length;
					updateRange = [updPos, updPos];
				} else {
					section = loc.node;
				}
			}

			if (section) {
				ruleSource = section.toSource();
				updateRange = section.range().toArray();
			}

			rule = cssEditTree.parse(ruleSource);

			patch.properties.forEach(function(prop) {
				rule.value(prop.name, prop.value);
			});

			updateValue = rule.source;
			while (loc && loc.rest && loc.rest.length) {
				updateValue = createSection(loc.rest.pop()[0], updateValue, style);
			}

			return source.substring(0, updateRange[0])
				+ updateValue
				+ source.substring(updateRange[1]);
		}
	};
});