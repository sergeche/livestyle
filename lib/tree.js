define(['lodash', 'cssParser', 'range'], function(_, cssParser, range) {
	var reS = /\s+/g;
	var fTokens = {'white': true, 'line': true, 'comment': true};
	var lookupS1 = {';': true, '{': true};
	var lookupS2 = {';': true, '}': true};

	function CSSNode(nameRange, valueRange, source, hints) {
		hints = hints || {};
		this.nameRange = nameRange;
		this.valueRange = valueRange;
		this.source = source;
		this.children = [];
		this.parent = null;
		this.type = hints.type || 'section';

		this._name = null;
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
			return this.nameRange ? this.nameRange.substring(this.source) : '';
		},

		/**
		 * Returns preprocessed and normalized node name which
		 * can be used for comparison
		 */
		name: function() {
			// check if we have cached name
			if (this._name === null) {
				this._name = parseSelectors(this._nameTokens() || this.rawName().trim()).join(', ');
			}

			return this._name;
		},

		/**
		 * Returns raw node value
		 * @returns {String}
		 */
		rawValue: function() {
			return this.valueRange ? this.valueRange.substring(this.source) : '';
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
		},

		/**
		 * Returns root node
		 * @return {CSSNode}
		 */
		root: function() {
			var ctx = this.parent;
			while (ctx.parent) {
				ctx = ctx.parent;
			}

			return ctx;
		},

		/**
		 * Returns list of CSS properties in this section, if available
		 * @return {Array} 
		 */
		properties: function() {
			var props = [], ix = -1;

			_.each(this.children, function(item) {
				if (item.type == 'property') {
					props.push({
						name: item.name().trim(),
						value: item.value().trim(),
						index: ++ix
					});
				}
			});

			return props;
		},

		_nameTokens: function() {
			var n = this._hints.name;
			if (n) {
				return this.root().tokens.slice(n[0], n[1]);
			}
		},

		range: function() {
			if (!this.parent) {
				return range.create2(0, this.source);
			}

			var start = this.nameRange.start;
			var end = this.valueRange ? this.valueRange.end : this.nameRange.end;
			return range.create2(start, end);
		},

		toSource: function() {
			return this.range().substring(this.source).trim();
		}
	};

	function TokenIterator(tokens, source) {
		this.tokens = tokens;
		this.len = tokens.length;
		this.source = source;
		this.start = this.pos = 0;
		this.root = new CSSNode(null, null, source, {type: 'root'});
		this.root.tokens = tokens;
		this.ctx = this.root;
	}

	TokenIterator.prototype = {
		hasNext: function () {
			return this.pos < this.len;
		},
		next: function() {
			return this.tokens[this.pos++];
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
		skipTo: function(lookup) {
			while (++this.pos < this.len && !(this.tokens[this.pos].type in lookup)) {}
		}
	};

	/**
	 * Parses CSS selector and returns normalized parts
	 * @param {String} source CSS selector source
	 * @returns {Array[String]}
	 */
	function parseSelectors(source) {
		// parse name with CSS parser to remove redundant tokens
		var tokens = _.isArray(source) ? source : cssParser.lex(source);
		tokens = _.filter(tokens, function(item) {
			return item.type !== 'comment';
		});

		var cur = '', selectors = [], t;
		for (var i = 0, il = tokens.length; i < il; i++) {
			t = tokens[i];
			if (t.type === ',') {
				selectors.push(cur.trim());
				cur = '';
			} else {
				cur += t.value;
			}
		}

		selectors.push(cur.trim());
		return _.compact(selectors);
	}

	/**
	 * Skips formatting tokens from current position
	 * @param {TokenIterator} tokens
	 * @param {Object} info
	 */
	function skipFormatting(iter) {
		var t, ft = fTokens;
		while ((t = iter.peek()) && t.type in ft) {
			iter.next();
		}
	}

	/**
	 * Consumes CSS section
	 * @param {TokenIterator} iter
	 */
	function consumeSection(iter) {
		skipFormatting(iter);

		var curTokens = function() {
			return [iter.start, iter.pos];
			// return iter.tokens.slice(iter.start, iter.pos);
		};

		iter.start = iter.pos;
		var token, nameRange, valueRange, nameTokens;
		while (token = iter.peek()) {
			if (token.type === '@') {
				// consume at-rule
				iter.start = iter.pos;
				iter.skipTo(lookupS1);
				if (iter.peek().type === ';') {
					// at-rule end
					// in this case, rule's value is located right after
					// @name token
					var fullRange = iter.curRange(true);
					var token = fullRange.substring(iter.source);
					var ruleName = token.match(/^@?\w+/)[0];
					var s = fullRange.start;
					fullRange.start += ruleName.length;

					iter.ctx.addChild(new CSSNode(range.create2(s, fullRange.start), fullRange, iter.source));
					iter.next();
					skipFormatting(iter);
					iter.start = iter.pos;
					continue;
				}
			} else if (token.type === '{' || token.type === ':') {
				nameRange = iter.curRange(true);
				nameTokens = curTokens();
				iter.next();
				if (token.type === '{') {
					// entering new section
					var valueStart = token.start;
					var child = iter.ctx.addChild(new CSSNode(nameRange, null, iter.source, {name: nameTokens}));
					iter.ctx = child;
					consumeSection(iter);
					iter.ctx = iter.ctx.parent;
					var endPos = iter.peek() ? iter.peek().start : _.last(iter.tokens).end;
					child.valueRange = range.create2(token.start, endPos);
					skipFormatting(iter);
					iter.start = iter.pos;
				} else {
					// the `:` token might be either a name-value separator
					// or pseudo-class modifier, like :hover.
					// We need to correctly identify this token first
					var oldPos = iter.pos, t, shouldSkip = false;
					while (t = iter.next()) {
						if (t.type === '{') {
							// looks like a pseudo-class
							iter.backUp(1);
							shouldSkip = true;
							break;
						} else if (t.type === ';' || t.type === '}') {
							// name-value separator
							iter.pos = oldPos;
							break;
						}
					}

					if (shouldSkip) {
						continue;
					}

					// consume CSS value
					iter.start = iter.pos;
					iter.skipTo(lookupS2);
					valueRange = iter.curRange(true);
					iter.ctx.addChild(new CSSNode(nameRange, valueRange, iter.source, {type: 'property', name: nameTokens}));
					
					if (iter.peek().type === ';') {
						iter.next();	
					}
					
					skipFormatting(iter);
					iter.start = iter.pos;
				}
			} else if (token.type === '}') {
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
			var tokens;
			if (_.isString(source)) {
				tokens = cssParser.parse(source);
			} else {
				tokens = source;
				source = cssParser.toSource(tokens);
			}

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