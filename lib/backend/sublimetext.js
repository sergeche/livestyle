/**
 * Sublime Text backend
 */
define(['lodash', 'tree', 'locator'], function(_, tree, locator) {
	/**
	 * Escape string to allow ST insert it as snippet
	 * without corruption
	 * @param  {String} str String to escape
	 * @return {String}
	 */
	function escape(str) {
		return str.replace(/\$/g, '\\$');
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

		return JSON.stringify({
			start: start,
			end: node.valueRange.end,
			value: '${1:' + escape(value) + '}'
		});
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
		if (_.isString(payload)) {
			payload = JSON.parse(payload);
		}

		var loc = locator.guessLocation(cssTree, payload.path);
		if (!loc.rest) {
			// found property to update
			return updateTreeNode(loc.node, payload.value);
		}

		if (loc.rest.length == 1) {
			// found container but without value, 
			// let’s create it
			var editTree = emmet.require('cssEditTree').parse(escape(loc.node.toSource()));
			editTree.value(loc.rest[0][0], '${1:' + escape(payload.value) + '}');
			var r = loc.node.range();
			return JSON.stringify({
				start: r.start,
				end: r.end,
				value: editTree.source
			});
		}

		// Path partially matched, but we have to re-create
		// all sections
		var style = learnStyle(loc.node);
		var padding = style.indent.match(/[ \t]+$/) ? RegExp.$0 : '';
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
		return JSON.stringify({
			start: r.end,
			end: r.end,
			value: '\n' + section
		});
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
		// 1. Separator between `name` and `{`
		// 2. Formatting for media queries
		return name + ' {' + style.indent + value + style.end + '}\n';
	}

	/**
	 * Tries to guess indentation for new sections/properties
	 * in given CSS node
	 * @param  {CSSNode} node
	 * @return {Object}
	 */
	function learnStyle(node) {
		var cssDOM;
		var style = {
			// TODO get default indentation from preferences
			indent: '\n\t',
			sep: ': ',
			end: '\n'
		};

		if (node.type == 'property') {
			node = node.parent;
		}

		while (node && node.parent && !node.children.length) {
			node = _.find(node.parent.children, function(n) {
				return !!n.children.length;
			}) || node.parent;
		}

		if (node) {
			cssDOM = emmet.require('cssEditTree').parse(node.toSource());
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
		 * Returns updated part of `content`, which 
		 * is identified by CSS payload
		 * @param  {String} content CSS file content
		 * @param  {Object} payload CSS update payload
		 * @return {String}
		 */
		updatedPart: function(content, payload) {
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