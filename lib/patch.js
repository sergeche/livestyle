if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

/**
 * Applies patch to CSS source
 */
define(function(require, exports, module) {
	var _ = require('lodash');
	var tree = require('./tree');
	var locator = require('./locator');
	var diff = require('./diff');
	var cssParser = require('emmet/lib/parser/css');
	var cssEditTree = require('emmet/lib/editTree/css');
	var utils = require('emmet/lib/utils/common');

	var defaultStyle = {
		// TODO read default style from preferences
		selSep: ' ',
		sectionSep: '\n',
		indent: '\n\t',
		sep: ': ',
		end: '\n'
	};

	var reStartSpace = /^\s+/;
	var reEndSpace = /\s+$/;

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

		// we need a node with children to get proper formatting
		var hasProperties = function(item) {
			for (var i = 0, il = item.children.length; i < il; i++) {
				if (item.children[i].type == 'property') {
					return true;
				}
			}

			return false;
		};

		var donor = node, _n;
		while (donor = donor.parent) {
			_n = _.find(donor.children, hasProperties);
			if (_n) {
				donor = _n;
				break;
			}
		}

		if (!donor) {
			// node not found, pick the first one with properties
			donor = _.find(node.all(), hasProperties);
		}

		if (donor && donor.parent) {
			style.selSep = donor.rawName().match(/([\s\n\r]+)$/) ? RegExp.$1 : '';
			cssDOM = cssEditTree.parse(donor.toSource());
		}

		if (cssDOM) {
			var lastElem = _.last(cssDOM.list());
			if (lastElem) {
				style.indent = lastElem.styleBefore;
				style.sep = lastElem.styleSeparator;
				style.end = cssDOM.source.substring(lastElem.fullRange().end, cssDOM.source.length - 1);
			}
		}

		return style;
	}

	/**
	 * Finds best insertion position for given item name in
	 * specified parent section. Some items like `@charset` or
	 * `@import` should be inserted at the top of the document
	 * @param  {CSSNode} parent Parent section where child should be inserted
	 * @param  {String} name    Child item name to be inserted
	 * @return {Number}
	 */
	function findBestInsertionPos(parent, name) {
		name = name.toLowerCase();
		if (name == '@charset') {
			return 0;
		}

		if (name == '@import') {
			// insert this import after all other imports
			for (var i = 0, il = parent.children.length, n; i < il; i++) {
				n = parent.children[i].name().toLowerCase();
				if (n != '@charset' && n != '@import') {
					return i;
				}
			}

			return 0;
		}

		return parent.children.length;
	}

	/**
	 * Tries to find best partial match of given path on CSS tree and returns
	 * target section
	 * @param  {CSSNode} cssTree CSS tree
	 * @param  {Array} cssPath Parsed CSS path
	 * @return {CSSNode}
	 */
	function bestPartialMatch(cssTree, cssPath, patch) {
		var loc = locator.guessLocation(cssTree, cssPath);
		if (loc.node.parent) {
			var ctxName = loc.node.name().toLowerCase();
			if (ctxName == '@import' && patch.action == 'add') {
				// in case of added @import rule, make sure it was added,
				// not replaced existing rule
				if (!loc.rest) {
					loc.rest = [];
				}

				loc.rest.unshift([ctxName]);
				loc.node = loc.node.parent;
			}
		}

		if (loc.rest) {
			var _value = '';
			var style = learnStyle(loc.node);

			// incomplete match, create new sections and inject it into tree
			var parentName = loc.rest[0][0];
			var lastSection = loc.rest.pop();
			if (diff.shouldCompareValues(lastSection[0]) && 'value' in patch) {
				_value = lastSection[0] + ' ' + patch.value + ';';
			} else {
				_value = createSection(lastSection[0], '', _.defaults({indent: ''}, style));
				_value = patchSection(tree.build(_value).children[0], patch, style);
			}

			var padding = style.indent.match(/([ \t]+)$/) ? RegExp.$1 : '';

			for (var i = loc.rest.length - 1; i >= 0; i--) {
				_value = createSection(loc.rest[i][0], utils.padString(_value, padding), style);
			}

			var insPos = findBestInsertionPos(loc.node, parentName);
			var totalChildren = loc.node.children.length;
			if (totalChildren && insPos !== totalChildren) {
				_value += style.sectionSep;
			} else if (totalChildren) {
				_value = style.sectionSep + _value;
			}

			// console.log('Partial "%s"', _value);

			loc.node.insert(tree.build(_value), insPos);
		} else {
			var rule = patchSection(loc.node, patch);
			loc.node.replace(tree.build(rule));
		}
	}

	/**
	 * Patches section by its value, not properties
	 * @param  {CSSNode} section Section to patch
	 * @param  {Object} patch   Patch to apply
	 * @return {String}         Updated section as string
	 */
	function patchSectionByValue(section, patch) {
		var fullSource = section.toFullSource();
		var value = section.rawValue();
		var offset = section.fullRange().start;
		var vStart = section.valueRange.start - offset;
		var vEnd = section.valueRange.end - offset;

		// get indentation
		var m;
		if (m = value.match(reStartSpace)) {
			vStart += m[0].length;
		}

		if (m = value.match(reEndSpace)) {
			vEnd -= m[0].length;
		}

		var sep = value ? '' : ' ';
		var out = fullSource.substring(0, vStart)
			+ sep + patch.value
			+ fullSource.substring(vEnd);

		// console.log('In:  "%s"', fullSource);
		// console.log('Out: "%s"', out);
		return out;
	}

	function patchSection(section, patch, style) {
		if ('value' in patch) {
			// updating full value of section, like `@import`
			return patchSectionByValue(section, patch);
		}

		style = style || learnStyle(section);
		var rule = cssEditTree.parse(section.toFullSource(), {
			styleBefore: style.indent,
			styleSeparator: style.sep
		});

		// update properties
		_.each(patch.properties, function(prop) {
			var ruleProp;
			if ('index' in prop) {
				ruleProp = rule.get(prop.index);
				if (!ruleProp || ruleProp.name() != prop.name) {
					ruleProp = _.last(rule.getAll(prop.name));
				}
			}

			if (ruleProp) {
				ruleProp.value(prop.value);
			} else {
				rule.value(prop.name, prop.value);
			}
		});

		// remove properties
		_.each(patch.removed, function(prop) {
			rule.remove(prop.name);
		});

		return rule.source;
	}


	return {
		/**
		 * Condenses list of patches: merges multiple patches for the same 
		 * selector into a single one and tries to reduce operations.
		 * The order of patches is very important since it affects the list
		 * of updates applied to source code
		 * @param {Array} patches
		 * @return {Array}
		 */
		condense: function(patches) {
			var byPath = {};
			var find = function(collection, propName) {
				for (var i = 0, il = collection.length; i < il; i++) {
					if (collection[i].name === propName) {
						return collection[i];
					}
				};
			};

			// group patches by their path for faster lookups
			_.each(patches, function(patch) {
				if (!patch) return;
				var path = locator.stringifyPath(patch.path);
				if (!(path in byPath)) {
					byPath[path] = [];
				}

				byPath[path].push(patch);
			});


			return _.map(byPath, function(patchList, path) {
				var topPatch = _.cloneDeep(patchList[0]);
				_.each(_.rest(patchList), function(patch) {
					if (patch.action == 'remove' || topPatch.action == 'remove') {
						// supress all previous updates
						return topPatch = patch;
					}

					topPatch.action = 'update';

					topPatch.removed = _.filter(topPatch.removed, function(item) {
						return !find(patch.properties, item.name);
					});

					topPatch.properties = topPatch.properties.concat(_.filter(patch.properties, function(item) {
						var origItem = find(topPatch.properties, item.name);
						if (origItem) {
							origItem.value = item.value;
							return false;
						}

						return true;
					}));

					topPatch.removed = topPatch.removed.concat(_.filter(patch.removed, function(item) {
						return !find(topPatch.removed, item.name);
					}));

				});

				return topPatch;
			});
		},

		/**
		 * Applies given patches to CSS source
		 * @param  {String} source  CSS source
		 * @param  {Array} patches  List of patches to apply
		 * @return {String}         Patched CSS source
		 */
		patch: function(source, patches, options) {
			patches = this.condense(_.isArray(patches) ? patches : [patches]);
			var cssTree = _.isString(source) ? tree.build(source) : source;

			_.each(patches, function(patch) {
				var cssPath = locator.parsePath(patch.path);
				var section = locator.locate(cssTree, cssPath, options);

				if (patch.action === 'remove') {
					if (section) {
						section.remove();
					}

					return;
				}

				if (!section) {
					bestPartialMatch(cssTree, cssPath, patch);
				} else {
					var rule = patchSection(section, patch);
					// update matched section with new source
					section.replace(tree.build(rule));
				}
			});

			return cssTree.source();
		},

		learnStyle: learnStyle
	};
});