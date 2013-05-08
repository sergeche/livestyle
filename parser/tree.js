define(['lodash', 'cssParser', 'range'], function(_, cssParser, range) {

	function CSSNode(nameRange, valueRange, source, type) {
		this.id = _.uniqueId('cn');
		this.nameRange = nameRange;
		this.valueRange = valueRange;
		this.source = source;
		this.children = [];
		this.parent = null;
		this.type = type || 'section';
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
		 * Returns descending node with given ID
		 * @param {String} id
		 * @returns {CSSNode}
		 */
		getById: function(id) {
			for (var i = 0, il = this.children.length, child; i < il; i++) {
				child = this.children[i];
				if (child.id === id) {
					return child;
				}

				var found = child.getById(id);
				if (found) {
					return found;
				}
			}
		},

		/**
		 * Returns raw node name (e.g. without additional preprocessing)
		 * @returns {String}
		 */
		rawName: function() {
			return this.nameRange.substring(this.source);
		},

		/**
		 * Returns preprocessed and normalized node name which
		 * can be used for comparison
		 */
		name: function() {
			// check if we have cached name
			if (this._nameCache && this._nameCache.range == this.nameRange.valueOf()) {
				return this._nameCache.name;
			}

			this._nameCache = {
				range: this.nameRange + ''
			};

			return this._nameCache.name = parseSelectors(this.rawName().trim()).join(', ');;
		},

		/**
		 * Returns raw node value
		 * @returns {String}
		 */
		rawValue: function() {
			return this.valueRange.substring(this.source);
		},

		/**
		 * Returns normalized node name
		 * @returns {String}
		 */
		value: function(normalize) {
			return this.rawValue().trim();
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
		}
	};

	function TokenIterator(tokens, source) {
		this.tokens = tokens;
		this.source = source;
		this.start = this.pos = 0;
		this.root = new CSSNode(null, null, source);
		this.ctx = this.root;
	}

	TokenIterator.prototype = {
		hasNext: function () {
			return this.pos < this.tokens.length;
		},
		next: function() {
			if (this.hasNext()) {
				return this.tokens[this.pos++];
			}
		},
		peek: function() {
			return this.tokens[this.pos];
		},
		curRange: function(tillStart) {
			var startTok = this.tokens[this.start];
			return range.create2(startTok.start, this.peek()[tillStart ? 'start' : 'end']);
		},
		backUp: function(n) {
			this.pos -= n;
		},
		skipTo: function(types) {
			if (!_.isArray(types)) {
				types = [types];
			}

			while (this.next()) {
				if (_.include(types, this.peek().type)) {
					break;
				}
			}
		}
	};

	/**
	 * Parses CSS selector and returns normalized parts
	 * @param {String} source CSS selector source
	 * @returns {Array[String]}
	 */
	function parseSelectors(source) {
		// parse name with CSS parser to remove redundant tokens
		var tokens = cssParser.parse(source).filter(function(item) {
			return item.type !== 'comment';
		});

		var iter = new TokenIterator(tokens, source);
		var selectors = [], token;
		skipFormatting(iter);
		iter.start = iter.pos;
		while (iter.hasNext()) {
			token = iter.peek();
			if (token.type == ',') {
				selectors.push(iter.curRange(true).substring(source).trim());
				iter.next();
				skipFormatting(iter);
				iter.start = iter.pos;
			} else {
				iter.next();
			}
		}

		var endPos = iter.peek() ? iter.peek().end : _.last(iter.tokens).end;
		var r = range.create2(iter.tokens[iter.start].start, endPos);
		selectors.push(r.substring(source).trim());

		return _(selectors)
			.compact()
			.map(function(sel) {
				return sel.trim().toLowerCase().replace(/\s+/g, ' ');
			})
			.value();
	}

	/**
	 * Skips formatting tokens from current position
	 * @param {TokenIterator} tokens
	 * @param {Object} info
	 */
	function skipFormatting(iter) {
		var fTokens = ['white', 'line', 'comment'];
		while (iter.peek() && _.include(fTokens, iter.peek().type)) {
			iter.next();
		}
	}

	/**
	 * Consumes CSS section
	 * @param {TokenIterator} iter
	 */
	function consumeSection(iter) {
		skipFormatting(iter);

		iter.start = iter.pos;
		var token, nameRange, valueRange;
		while (token = iter.peek()) {
			if (token.type == '@') {
				// consume at-rule
				iter.start = iter.pos;
				iter.skipTo([';', '{']);
				if (iter.peek().type == ';') {
					// at-rule end
					iter.ctx.addChild(new CSSNode(iter.curRange(true), range.create(iter.peek().start, 0), iter.source));
					iter.next();
					skipFormatting(iter);
					iter.start = iter.pos;
					continue;
				}
			} else if (token.type == '{' || token.type == ':') {
				nameRange = iter.curRange(true);
				iter.next();
				if (token.type == '{') {
					// entering new section
					var valueStart = token.start;
					var child = iter.ctx.addChild(new CSSNode(nameRange, null, iter.source));
					iter.ctx = child;
					consumeSection(iter);
					iter.ctx = iter.ctx.parent;
					var endPos = iter.peek() ? iter.peek().start : _.last(iter.tokens).end;
					child.valueRange = range.create2(token.start, endPos);
					skipFormatting(iter);
					iter.start = iter.pos;
				} else {
					// consume CSS value
					iter.start = iter.pos;
					iter.skipTo([';', '}']);
					valueRange = iter.curRange(true);
					iter.ctx.addChild(new CSSNode(nameRange, valueRange, iter.source, 'property'));
					
					if (iter.peek().type == ';') {
						iter.next();	
					}
					
					skipFormatting(iter);
					iter.start = iter.pos;
				}
			} else if (token.type == '}') {
				return iter.next();
			} else {
				iter.next();
			}
		}
	}

	return {
		/**
		 * Builds tree from given CSS tokens
		 * @param {String} source Parsed CSS tokens
		 * @returns {CSSNode}
		 */
		build: function(source) {
			var tokens = cssParser.parse(source);
			var iter = new TokenIterator(tokens, source);
			while (iter.hasNext()) {
				consumeSection(iter);	
			}
			return iter.root;
		},

		parseSelectors: parseSelectors,
		CSSNode: CSSNode,
		TokenIterator: TokenIterator
	};
});