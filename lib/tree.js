if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var selector = require('./preprocessor/selector');
	var cssParser = require('emmet/lib/parser/css');
	var range = require('emmet/lib/assets/range');
	var cssSections = require('emmet/lib/utils/cssSections');
	var cssEditTree = require('emmet/lib/editTree/css');

	var reAtRule = /^(@[\w\-]+)\s*/;
	var idCounter = 0;
	var maxId = 1000000;

	function normalizeSelector(sel) {
		return selector.rules(sel).join(', ')
			.trim()
			.replace(/\s{2,}/g, ' ')
			.replace(/\(\s+/g, '(')
			.replace(/\s+\)/g, ')')
			.replace(/^@page:/, '@page :');
	}

	function getId() {
		idCounter = (idCounter + 1) % maxId;
		return 'cn' + idCounter;
	}

	function CSSNode(nameRange, valueRange, hints) {
		hints = hints || {};
		
		this.id = getId();
		this.nameRange = nameRange;
		this.valueRange = valueRange;
		this.children = [];
		this.parent = null;
		this.type = hints.type || 'root';

		this._name = null;
		this._root = null;
		this._nameLower = null;
		this._value = null;
		this._hints = hints;
	}

	/**
	 * @param {CSSNode} node
	 * @returns {CSSNode}
	 */
	CSSNode.prototype = {
		addChild: function(node) {
			node.parent = this;
			this.children.push(node);
			return node;
		},

		/**
		 * Returns raw node name (e.g. without additional preprocessing)
		 * @returns {String}
		 */
		rawName: function() {
			return this.nameRange ? this.nameRange.substring(this.source()) : '';
		},

		/**
		 * Returns preprocessed and normalized node name which
		 * can be used for comparison
		 * @param {Boolean} isLower Return name in lower-case. Lowercase
		 * value is cached internally so it works much faster that
		 * always lower-casing name explicitly
		 * @returns {String}
		 */
		name: function(isLower) {
			// check if we have cached name
			if (this._name === null) {
				this._name = this.rawName().trim();
				if (this.type === 'section') {
					// TODO better normalization: remove spaces before and after braces,
					// remove double braces
					this._name = normalizeSelector(this._name);
				}
			}

			if (isLower) {
				if (this._nameLower === null) {
					this._nameLower = this._name.toLowerCase();
				}

				return this._nameLower;
			}

			return this._name;
		},

		/**
		 * Overrides name of current node. Useful for resolving selectors, 
		 * for example, variable interpolation in LESS
		 * @param {String} name New node name
		 */
		setName: function(name) {
			this._name = name;
		},


		/**
		 * Returns raw node value
		 * @returns {String}
		 */
		rawValue: function() {
			return this.valueRange ? this.valueRange.substring(this.source()) : '';
		},

		/**
		 * Returns normalized node name
		 * @returns {String}
		 */
		value: function() {
			if (this._value === null) {
				this._value = this.rawValue().trim();
			}
			return this._value;
		},

		valueOf: function(padding) {
			padding = padding || '';
			var output = '';
			this.children.forEach(function(item) {
				output += padding + '(n)' + item.name();
				if (item.children.length) {
					output += '\n' + item.valueOf(padding + '\t');
				} else {
					output += ': (v)' + item.value() + '\n';
				}
			});

			return output;
		},

		/**
		 * Returns first child node with given name
		 * @param  {String} name Node name
		 * @return {CSSNode}
		 */
		get: function(name) {
			return _.find(this.children, function(item) {
				return item.name() == name;
			});
		},

		/**
		 * Returns root node
		 * @return {CSSNode}
		 */
		root: function() {
			if (this._root) {
				return this._root;
			}

			if (!this.parent) {
				return this;
			}

			var ctx = this.parent;
			while (ctx.parent) {
				ctx = ctx.parent;
			}

			return this._root = ctx;
		},

		/**
		 * Returns list of CSS properties in this section, if available
		 * @return {Array} 
		 */
		properties: function() {
			var props = [], ix = -1;

			for (var i = 0, il = this.children.length, item; i < il; i++) {
				item = this.children[i];
				if (item.type === 'property') {
					props.push({
						name: item.name(),
						value: item.value(),
						index: ++ix,
						node: item
					});
				}
			}

			return props;
		},

		/**
		 * Returns range of current node
		 * @return {Range}
		 */
		range: function() {
			if (!this.parent) {
				return range.create2(0, this.source);
			}

			var start = this.nameRange.start;
			var end = this.valueRange ? this.valueRange.end : this.nameRange.end;
			return range.create2(start, end);
		},

		/**
		 * Returns full range (including punctuation) of current node
		 * @return {Range}
		 */
		fullRange: function() {
			if (!this.parent) {
				return this.range();
			}

			var start = this.nameRange.start;
			var end = this.valueRange ? this.valueRange.end : this.nameRange.end;
			if (this._hints.end) {
				end = this._hints.end.end;
			}

			return range.create2(start, end);
		},

		toSource: function() {
			return this.range().substring(this.source()).trim();
		},

		toFullSource: function() {
			return this.fullRange().substring(this.source());
		},

		/**
		 * Returns list of all inner section nodes of current node.
		 * Each result item contains full path of node and node reference
		 * @return {Array}
		 */
		sectionList: function(out) {
			out = out || [];
			this.children.forEach(function(item) {
				if (item.type == 'section') { // not a root element or property
					var path = [item.name()];
					var ctx = item.parent;
					while (ctx.parent) {
						path.unshift(ctx.name());
						ctx = ctx.parent;
					}

					out.push({
						path: path,
						node: item
					});
				}
				item.sectionList(out);
			});

			return out;
		},

		/**
		 * Returns original CSS source
		 * @return {String}
		 */
		source: function() {
			return this.root()._source;
		},

		/**
		 * Exports current node as restorable JSON object, used for caching
		 * and comparing. E.g. this is not the complete tree and it can't be
		 * used for source manipulation, just for diff'ing
		 * @return {Object}
		 */
		toJSONCache: function() {
			if (!this.parent) {
				return this.children.map(function(c) {
					return c.toJSONCache();
				});
			}

			var out = {
				name: this.name(),
				value: this.value(),
				type: this.type
			};

			if (this.type == 'section') {
				out.children = this.children.map(function(c) {
					return c.toJSONCache();
				});
			} else {
				out.value = this.value();
			}

			return out;
		},

		/**
		 * Returns plain list of all child nodes of current node
		 * @return {Array}
		 */
		all: function() {
			var out = [];
			var add = function(item) {
				for (var i = 0, il = item.children.length; i < il; i++) {
					out.push(item.children[i]);
					add(item.children[i]);
				}
			};

			add(this);
			return out;
		},

		// these are tree modification methods that affects bound
		// source and tokens
		
		/**
		 * Returns list of all following siblings and direct parents of current list.
		 * Used to get list of nodes to be updated when current node is modified
		 * @return {Array}
		 */
		_allSiblings: function(andSelf) {
			var out = [], ctx = this, children;

			var add = function(item) {
				out.push(item);
				for (var i = 0, il = item.children.length; i < il; i++) {
					add(item.children[i]);
				}
			};

			if (andSelf) {
				out.push(this);
			}

			while (ctx.parent) {
				children = ctx.parent.children;
				for (var i = children.indexOf(ctx) + 1, il = children.length; i < il; i++) {
					add(children[i]);
				}

				ctx = ctx.parent;
			}

			return out;
		},

		/**
		 * Returns index of current node in parent's child list
		 * @return {CSSNode}
		 */
		index: function() {
			return this.parent ? this.parent.children.indexOf(this) : 0;
		},

		modifyRanges: function(size, andSelf) {
			// shift all ranges of siblings
			_.each(this._allSiblings(andSelf), function(item) {
				shiftNodeRanges(item, size);
			});

			// shift ends of parents
			var ctx = this;
			while (ctx = ctx.parent) {
				if (ctx.valueRange) {
					ctx.valueRange.end += size;
				}
			}
		},

		/**
		 * Removes current node from tree
		 * @param {Boolean} keepFormatting Keep formatting (indentation
		 * and spaces) after current rule
		 */
		remove: function(keepFormatting) {
			if (!this.parent) {
				return;
			}

			var ix = this.index();
			var r = this.fullRange();
			if (!keepFormatting && this.parent && this.parent.children[ix + 1]) {
				// remove formatting between sections too
				r.end = this.parent.children[ix + 1].nameRange.start;
			}

			this.modifyRanges(-r.length());
			this.parent.children.splice(this.index(), 1);

			// remove item from source
			var root = this.root();
			root._source = root._source.substring(0, r.start) + root._source.substring(r.end);
		},

		/**
		 * Inserts given subtree into specified child position
		 * of current node.
		 * The given node must be attached to another tree with
		 * proper ranges and source
		 * @param {CSSNode} node
		 * @param {Number} pos Position index where node should be inserted.
		 * If not specified, node will be inserted at the end
		 */
		insert: function(subtree, pos) {
			if (_.isUndefined(pos)) {
				pos = this.children.length;
			}

			var subSource = subtree.source();
			var size = subSource.length;

			var offset = 0;
			if (this.children[pos]) {
				var ctx = this.children[pos];
				offset = ctx.fullRange().start;
				ctx.modifyRanges(size, true);
			} else if (this.children.length) {
				var lastChild = _.last(this.children);
				offset = lastChild.fullRange().end;
				this.modifyRanges(size);
			} else if (this.parent) {
				offset = this.valueRange ? this.valueRange.start + 1 : this.nameRange.end;
				this.modifyRanges(size);
			} else {
				offset = this.source().length;
			}

			_.each(subtree.all(), function(item) {
				shiftNodeRanges(item, offset);
			});

			// TODO find better location for subsection insertion

			// inject subtree
			this.children.splice.apply(this.children, [pos, 0].concat(subtree.children));
			var parent = this;
			subtree.children.forEach(function(item) {
				item.parent = parent;
			});

			// inject source
			var root = this.root();
			root._source = root._source.substring(0, offset) + subSource + root._source.substring(offset);
		},

		/**
		 * Replaces current node with given subtree
		 * @param  {CSSNode} subtree
		 */
		replace: function(subtree) {
			this.parent.insert(subtree, this.index());
			this.remove(true);
		}
	};

	function shiftNodeRanges(node, size) {
		node.nameRange && node.nameRange.shift(size);
		node.valueRange && node.valueRange.shift(size);
		_.each(node._hints, function(v) {
			if (range.isRange(v)) {
				v.shift(size);
			}
		});
	}

	function consumeProperties(node, source, offset) {
		offset = offset || 0;
		var properties = cssEditTree.extractPropertiesFromSource(source, offset);
		for (var j = 0, jl = properties.length, p, m; j < jl; j++) {
			p = properties[j];
			if (!p.value.length() || p.nameText.charAt(0) == '@') {
				// empty value. is it an at-rule?
				// var originalName = p.name.substring(source);
				var originalName = source.substr(p.name.start - offset, p.name.length());
				if (m = originalName.match(reAtRule)) {
					var value = p.valueText || originalName.substring(m[0].length);
					var end = '';
					var name = m[1];

					if (value.charAt(value.length - 1) == ';') {
						end = ';';
						value = value.substring(0, value.length - 1);
					}

					node.addChild(new CSSNode(
						range(p.name.start, name),
						p.value.length() ? p.value : range(p.name.start + m[0].length, value), 
						{
							type: 'at-rule',
							end: range(p.name.start + originalName.length - end.length, end)
						}
					));

					continue;
				}
			}

			node.addChild(new CSSNode(p.name, p.value, {
				type: 'property',
				end: p.end
			}));
		}
	}

	/**
	 * Recursively parses CSS properties in given sections
	 * and adds them to provided context node
	 * @param  {Object} section Parsed CSS section
	 * @param  {CSSNode} ctx     Context node where parsed section should be placed
	 * @param  {String} source  Original source
	 */
	function parseSection(section, ctx, source) {
		var selRange = range.create2(section.range.start, section.range._selectorEnd);
		var valRange = range.create2(section.range._contentStart, section.range.end);
		var sectionNode = new CSSNode(selRange, valRange, {type: 'section'});
		ctx.addChild(sectionNode);

		var offset = valRange.start + 1;
		var subsrc, subsection;
		for (var i = 0, il = section.children.length; i < il; i++) {
			subsection = section.children[i];
			subsrc = source.substring(offset, subsection.range.start);
			consumeProperties(sectionNode, subsrc, offset);

			parseSection(subsection, sectionNode, source);
			offset = subsection.range.end;
		}

		// parse tail
		subsrc = source.substring(offset, valRange.end - 1);
		consumeProperties(sectionNode, subsrc, offset);
	}

	return {
		/**
		 * Builds tree from given CSS tokens
		 * @param {String} source Parsed CSS tokens
		 * @returns {CSSNode}
		 */
		build: function(source) {
			if (!_.isString(source)) {
				throw new Error('Source must be a string');
			}

			var sectionTree = cssSections.sectionTree(source);
			var root = new CSSNode();
			root._source = source;

			if (!sectionTree.children.length) {
				consumeProperties(root, source);
			} else {
				consumeProperties(root, source.substring(0, sectionTree.children[0].range.start));
				_.each(sectionTree.children, function(section) {
					parseSection(section, root, source);
				});

				var lastSection = _.last(sectionTree.children);
				consumeProperties(root, source.substring(lastSection.range.end), lastSection.range.end);
			}

			return root;
		},

		/**
		 * Restores tree from JSON cache
		 * @param  {Object} obj  Tree JSON
		 * @param  {CSSNode} node Parent node of generated tree
		 * @return {CSSNode}
		 */
		fromJSONCache: function(obj, node) {
			if (_.isString(obj)) {
				obj = JSON.parse(obj);
			}

			node = node || new CSSNode();
			_.each(obj, function(item) {
				var child = new CSSNode();
				child._name = item.name;
				child._value = item.value;
				child.type = item.type;
				node.addChild(child);

				if (item.children) {
					this.fromJSONCache(item.children, child);
				}
			}, this);
			return node;
		},

		CSSNode: CSSNode
	};
});