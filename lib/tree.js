define(['lodash', 'cssParser', 'range'], function(_, cssParser, range) {
	var reS = /\s+/g;
	var fTokens = {'white': true, 'line': true, 'comment': true};
	var lookupS1 = {';': true, '{': true};
	var lookupS2 = {';': true, '}': true};

	function CSSNode(nameRange, valueRange, hints) {
		hints = hints || {};
		
		this.nameRange = nameRange;
		this.valueRange = valueRange;
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
			return this.nameRange ? this.nameRange.substring(this.source()) : '';
		},

		/**
		 * Returns preprocessed and normalized node name which
		 * can be used for comparison
		 */
		name: function() {
			// check if we have cached name
			if (this._name === null) {
				this._name = parseSelectors(this._nameTokens() || this.rawName()).join(', ').trim();
				if (this.type === 'property') {
					// check edge case: consumed incomplete CSS property,
					// for example: m10\nposition 
					// (e.g. user start writing new property or Emmet abbreviation)
					this._name = _.last(this._name.split(/\s+/));
				}
			}

			return this._name;
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
			if (!this._value) {
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
			return this.range().substring(this.source()).trim();
		},

		/**
		 * Returns original CSS source
		 * @return {String}
		 */
		source: function() {
			return this._source || this.root()._source;
		},

		/**
		 * Expoprts current node as restorable JSON object, used for caching
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

			if (this.type == 'property') {
				out.value = this.value();
			} else {
				out.children = this.children.map(function(c) {
					return c.toJSONCache();
				});
			}

			return out;
		}
	};

	function TokenIterator(tokens, source) {
		this.tokens = tokens;
		this.len = tokens.length;
		this.source = source;
		this.start = this.pos = 0;
		this.root = new CSSNode(null, null, {type: 'root'});
		this.root._source = source;
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

					iter.ctx.addChild(new CSSNode(range.create2(s, fullRange.start), fullRange));
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
					var child = iter.ctx.addChild(new CSSNode(nameRange, null, {name: nameTokens}));
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
					iter.ctx.addChild(new CSSNode(nameRange, valueRange, {type: 'property', name: nameTokens}));
					
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

			node = node || new CSSNode(null, null, {type: 'root'});
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

		parseSelectors: parseSelectors,
		CSSNode: CSSNode,
		TokenIterator: TokenIterator
	};
});