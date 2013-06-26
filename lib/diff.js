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
				pathString: locator.stringifyPath(path),
				section: section
			};
		});
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
			var lookupIx = 0;

			var that = this;
			var compareSections = function(item1, item2) {
				// compare at-rules
				if (that.shouldCompareValues(item2.section)) {
					var v1 = item1.section.value();
					var v2 = item2.section.value();

					if (v1 != v2) {
						out.push({
							path: item2.path,
							action: 'update',
							value: v2
						});
					}

					return;
				}
				
				var sd = that.diffSections(item1.section, item2.section);
				if (sd) {
					out.push({
						path: item2.path,
						action: 'update',
						properties: sd.added.concat(sd.updated),
						removed: sd.removed
					});
				}
			};

			_.each(l2, function(item, i) {
				var op = l1[lookupIx];
				if (!op) {
					// section was added at the end
					return out.push({
						path: item.path,
						action: 'add',
						properties: item.section.properties()
					});
				}

				if (item.pathString === op.pathString) {
					++lookupIx;
					return compareSections(op, item);
				}

				// look further for property with the same name
				for (var nextIx = lookupIx + 1, il = l1.length, next; nextIx < il; nextIx++) {
					next = l1[nextIx];
					if (next.pathString === item.pathString) {
						out = out.concat(l1.slice(lookupIx, nextIx).map(function(p) {
							return {
								path: p.path,
								action: 'remove'
							}
						}));
						lookupIx = nextIx + 1;
						return compareSections(next, item);
					}
				}

				// if we reached this point then the current property
				// was added to source2
				out.push({
					path: item.path,
					action: 'add',
					properties: item.section.properties()
				});
			}, this);

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
		diffSections: function(s1, s2) {
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
		},

		/**
		 * Check if CSS node with given name/selector should be compared
		 * by value, not by children contents
		 * @param  {CSSNode} node CSS node or node name/selector (string)
		 * @return {Boolean}
		 */
		shouldCompareValues: function(node) {
			if (!_.isString(node)) {
				node = node.name().toLowerCase();
			}

			return node in valueCompare;
		}
	};
});