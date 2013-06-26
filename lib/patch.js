/**
 * Applies patch to CSS source
 */
define(['lodash', 'tree', 'locator', 'diff', 'cssParser'], function(_, tree, locator, diff, cssParser) {
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
			try {
				cssDOM = emmet.require('cssEditTree').parse(donor.toSource());
			} catch (e) {}
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
	 * Tries to find best partial match of given path on CSS tree and returns
	 * target section
	 * @param  {CSSNode} cssTree CSS tree
	 * @param  {Array} cssPath Parsed CSS path
	 * @return {CSSNode}
	 */
	function bestPartialMatch(cssTree, cssPath, patch) {
		var loc = locator.guessLocation(cssTree, cssPath);
		if (loc.rest) {
			// incomplete match, create new sections and inject it into tree
			var style = learnStyle(loc.node);
			var _value = createSection(loc.rest.pop()[0], '', _.defaults({indent: ''}, style));

			_value = patchSection(tree.build(_value).children[0], patch, style).source;

			var padding = style.indent.match(/([ \t]+)$/) ? RegExp.$1 : '';
			var utils = emmet.require('utils');

			for (var i = loc.rest.length - 1; i >= 0; i--) {
				_value = createSection(loc.rest[i][0], utils.padString(_value, padding), style);
			}

			if (loc.node.children.length) {
				_value = style.sectionSep + _value;
			}

			loc.node.insert(tree.build(_value));
		} else {
			var rule = patchSection(loc.node, patch);
			loc.node.replace(tree.build(rule.source));
		}
	}

	function patchSection(section, patch, style) {
		style = style || learnStyle(section);
		var rule = emmet.require('cssEditTree').parse(section.toFullSource(), {
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

		return rule;
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
		patch: function(source, patches) {
			patches = this.condense(_.isArray(patches) ? patches : [patches]);
			var cssTree = _.isString(source) ? tree.build(source) : source;

			_.each(patches, function(patch) {
				var cssPath = locator.parsePath(patch.path);
				var section = locator.locate(cssTree, cssPath);

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
					section.replace(tree.build(rule.source));
				}
			});

			return cssTree.source();
		},

		learnStyle: learnStyle
	};
});