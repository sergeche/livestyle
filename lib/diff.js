/**
 * Calculates structural difference between two CSS sources.
 * Useful for calculating diff when editing file in text editor
 */
define(['lodash', 'tree', 'locator'], function(_, tree, locator) {

	var valueCompare = {
		'@import': true,
		'@charset': true
	};

	/**
	 * Parses CSS source into tree
	 * @param  {String} source
	 * @return {CSSNode}
	 */
	function parseSource(source) {
		if (source instanceof tree.CSSNode) {
			return source;
		}

		return tree.build(source);
	}

	/**
	 * Returns plain list of all sections in given CSS tree
	 * @param  {CSSNode} node
	 * @param {Array} out
	 * @return {Array}
	 */
	function sectionList(node, out) {
		out = out || [];
		if (node && node.children) {
			// for better performance, don't use _.each or [].forEach iterators
			for (var i = 0, il = node.children.length, c; i < il; i++) {
				c = node.children[i];
				if (c.type != 'property') {
					out.push(c);
					sectionList(c, out);
				}
			}
		}

		return out;
	}

	/**
	 * Transforms given sections list into array with
	 * absolute paths
	 * @param  {Array} sections CSS sections list
	 * @return {Array}
	 */
	function sectionPaths(sections) {
		if (!(sections instanceof Array)) {
			sections = sectionList(sections);
		}

		return _.map(sections, function(section) {
			var path = locator.createPath(section);
			return {
				path: path,
				pathString: locator.stringifyPath(path, true),
				section: section
			};
		});
	}

	/**
	 * Check if CSS node with given name/selector should be compared
	 * by value, not by children contents
	 * @param  {CSSNode} node CSS node or node name/selector (string)
	 * @return {Boolean}
	 */
	function shouldCompareValues(node) {
		if (!_.isString(node)) {
			node = node.name().toLowerCase();
		} else {
			node = node.toLowerCase();
		}

		return node in valueCompare;
	}

	/**
	 * Compares properties inside CSS sections (selectors).
	 * Does not take into account subsections, compares 
	 * just properties
	 * @param  {CSSNode} s1
	 * @param  {CSSNode} s2
	 * @return {Object} Returns null if sections are equal
	 */
	function diffSections(s1, s2) {
		var props1 = s1.properties();
		var props2 = s2.properties();

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
	function sectionsEqual(s1, s2) {
		if (shouldCompareValues(s1)) {
			return s1.value() == s2.value();
		}

		return !diffSections(s1, s2);
	}

	/**
	 * Removes identical CSS sections from both lists.
	 * Lists are modiefied in-place
	 * @param  {Array} sections1
	 * @param  {Array} sections2
	 */
	function removeEqual(sections1, sections2) {
		var diff2 = [];

		var item1, item2;
		// optimize innner loops for performance
		for (var i = 0, il = sections2.length; i < il; i++) {
			item2 = sections2[i];

			for (var j = 0, jl = sections1.length, item1; j < jl; j++) {
				item1 = sections1[j];
				if (item1.pathString == item2.pathString && sectionsEqual(item1.section, item2.section)) {
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

	return {
		/**
		 * Generates patches that describe structural difference
		 * between two CSS sources
		 * @param  {String} source1
		 * @param  {String} source2
		 * @return {Array}
		 */
		diff: function(source1, source2) {
			var t1 = parseSource(source1);
			var t2 = parseSource(source2);

			var l1 = sectionPaths(t1);
			var l2 = sectionPaths(t2);
			var out = [];

			// first, remove all identical sections from both lists
			// and leave only different ones
			removeEqual(l1, l2);

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
						var sd = diffSections(item1.section, item2.section);
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

			return out;
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