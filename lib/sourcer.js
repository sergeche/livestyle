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

	return {
		/**
		 * Updates given CSS file content with payload (CSS delta)
		 * @param  {String} content CSS file to patch
		 * @param  {Object} payload Update payload
		 * @return {Object}
		 */
		update: function(content, payload) {
			if (_.isString(payload)) {
				payload = JSON.parse(payload);
			}

			var cssTree = tree.build(content);
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
		}
	};
});