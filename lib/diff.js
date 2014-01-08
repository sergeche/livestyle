/**
 * Calculates structural difference between two CSS, LESS or SCSS sources.
 * Useful for calculating diff when editing file in text editor
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var tree = require('./tree');
	var locator = require('./locator');
	var lessCtx = require('./less/context');

	var valueCompare = {
		'@import': true,
		'@charset': true
	};

	var defaultOptions = {
		syntax: 'css'
	};

	function opt(data) {
		return _.extend({}, defaultOptions, data || {});
	}

	/**
	 * Parses CSS source into tree
	 * @param  {String} source
	 * @return {CSSNode}
	 */
	function parseSource(source, options) {
		if (!(source instanceof tree.CSSNode)) {
			source = tree.build(source);
		}

		if (options.syntax == 'less') {
			lessCtx.resolveSelectors(source);
		}

		return source;
	}

	/**
	 * Check if CSS node with given name/selector should be compared
	 * by value, not by children contents
	 * @param  {CSSNode} node CSS node or node name/selector (string)
	 * @return {Boolean}
	 */
	function shouldCompareValues(node) {
		if (!_.isString(node)) {
			return node.type != 'section';
		}

		return node.toLowerCase() in valueCompare;
	}

	/**
	 * Returns properties list for given node
	 * @param  {CSSNode} node
	 * @param  {String} syntax
	 * @return {Array}
	 */
	function getProperties(node, options) {
		if (options.syntax == 'less') {
			return lessCtx.properties(node, options);
		}

		return node.properties();
	}

	/**
	 * Compares properties inside CSS sections (selectors).
	 * Does not take into account subsections, compares 
	 * just properties
	 * @param  {CSSNode} s1
	 * @param  {CSSNode} s2
	 * @return {Object} Returns null if sections are equal
	 */
	function diffSections(s1, s2, options) {
		options = opt(options);
		var props1 = getProperties(s1, options);
		var props2 = getProperties(s2, options);

		var added = [], updated = [], removed = [];
		var lookupIx = 0;

		_.each(props2, function(p, i) {
			var op = props1[lookupIx];
			if (!op) {
				// property was added at the end
				return added.push(p);
			}

			if (p.name === op.name) {
				++lookupIx;
				if (p.value !== op.value) {
					// same property, different value:
					// the property was updated
					// TODO check for edge cases with vendor-prefixed values
					updated.push(p);
				}

				return;
			}

			// look further for property with the same name
			for (var nextIx = lookupIx + 1, il = props1.length; nextIx < il; nextIx++) {
				if (props1[nextIx].name === p.name && props1[nextIx].value === p.value) {
					removed = removed.concat(props1.slice(lookupIx, nextIx));
					lookupIx = nextIx + 1;
					return;
				}
			}

			// if we reached this point then the current property
			// was added to section2
			added.push(p);
		});

		removed = removed.concat(props1.slice(lookupIx, props1.length));

		if (added.length + updated.length + removed.length === 0) {
			return null;
		}

		return {
			added: added,
			updated: updated,
			removed: removed
		};
	}

	/**
	 * Check if section contents are equal
	 * @param  {CSSNode} s1 
	 * @param  {CSSNode} s2
	 * @return {Boolean}
	 */
	function sectionsEqual(s1, s2, options) {
		if (shouldCompareValues(s1)) {
			return s1.value() == s2.value();
		}

		// fast check: if sections contents are equal,
		// no need to compare their structures
		// if (s1.value() == s2.value()) {
		// 	return true;
		// }

		// don't use diffSections() here since it pretty slow for
		// such checks
		var s1p = getProperties(s1, options);
		var s2p = getProperties(s2, options);
		if (s1p.length !== s2p.length) {
			return false;
		}

		for (var i = 0, il = s1p.length; i < il; i++) {
			if (s1p[i].name !== s2p[i].name || s1p[i].value !== s2p[i].value) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Removes identical CSS sections from both lists.
	 * Lists are modiefied in-place
	 * @param  {Array} sections1
	 * @param  {Array} sections2
	 */
	function removeEqual(sections1, sections2, options) {
		var diff2 = [];

		var item1, item2;
		// optimize innner loops for performance
		for (var i = 0, il = sections2.length; i < il; i++) {
			item2 = sections2[i];

			for (var j = 0, jl = sections1.length, item1; j < jl; j++) {
				item1 = sections1[j];
				if (item1.pathString == item2.pathString && sectionsEqual(item1.section, item2.section, options)) {
					// nodes are equal, get rid of them
					sections1.splice(j, 1);
					sections2.splice(i, 1);
					il--;
					i--;
					break;
				}
			}
		};
	}

	/**
	 * Resolves values of properties from given diff.
	 * Preprocessors like LESS or SCSS could have expressions
	 * in values: this method evaluates these expressions
	 * and inserts result as property value
	 * @param  {Object} diff
	 * @param  {Object} options
	 */
	function resolveValues(diff, options) {
		_.each(diff, function(item) {
			// _.each(item.properties, function(prop) {
			// 	if (prop.node) {
			// 		if (options.syntax == 'less') {
			// 			try {
			// 				prop.value = lessCtx.eval(prop.node);
			// 			} catch(e) {}
			// 		}
			// 	}
			// });

			sanitize(item.properties);
			sanitize(item.removed);
		});

		return diff;
	}

	function sanitize(list) {
		if (!list) {
			return;
		}

		list.forEach(function(item) {
			if ('node' in item) {
				delete item.node;
			}
		})
	}

	return {
		/**
		 * Generates patches that describe structural difference
		 * between two CSS sources
		 * @param  {String} source1
		 * @param  {String} source2
		 * @return {Array}
		 */
		diff: function(source1, source2, options) {
			options = opt(options);

			var t1 = parseSource(source1, options);
			var t2 = parseSource(source2, options);

			var l1 = locator.toList(t1, options);
			var l2 = locator.toList(t2, options);
			var out = [];

			// first, remove all identical sections from both lists
			// and leave only different ones
			removeEqual(l1, l2, options);

			// find and remove from list sections with the same name:
			// they should be modified
			_.each(l2, function(item2, i) {
				var item1 = _.find(l1, function(item1) {
					return item1.pathString == item2.pathString;
				});

				var p = {
					path: item2.path,
					action: item1 ? 'update' : 'add'
				};

				if (shouldCompareValues(item2.section)) {
					p.value = item2.section.value();
				}

				if (p.action == 'update') {
					// section was updated
					if (!('value' in p)) {
						var sd = diffSections(item1.section, item2.section, options);
						p.properties = sd.added.concat(sd.updated);
						p.removed = sd.removed;
					}
					
					l1 = _.without(l1, item1);
				} else {
					// section was added
					if (!('value' in p)) {
						p.properties = item2.section.properties();
					}
				}

				out.push(p);
			});

			// remove the rest sections from first list
			_.each(l1, function(item) {
				out.push({
					path: item.path,
					action: 'remove'
				});
			});

			return resolveValues(out, options);
		},

		/**
		 * Compares properties inside CSS sections (selectors).
		 * Does not take into account subsections, compares 
		 * just properties
		 * @param  {CSSNode} s1
		 * @param  {CSSNode} s2
		 * @return {Object} Returns null if sections are equal
		 */
		diffSections: diffSections,

		/**
		 * Check if CSS node with given name/selector should be compared
		 * by value, not by children contents
		 * @param  {CSSNode} node CSS node or node name/selector (string)
		 * @return {Boolean}
		 */
		shouldCompareValues: shouldCompareValues
	};
});