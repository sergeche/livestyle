define(['lodash', 'cssParser', 'range'], function(_, cssParser, range) {
	var reS = /\s+/g;
	var reSpaces = /[ \t]+/g;
	var fTokens = {'white': true, 'line': true, 'comment': true};
	var sTokens = {'white': true, 'line': true};
	var lookupS1 = {';': true, '{': true};
	var lookupS2 = {';': true, '}': true};
	var tokenStub = {start: 0, end: 0};

	function CSSNode(nameRange, valueRange, hints) {
		hints = hints || {};
		
		this.nameRange = nameRange;
		this.valueRange = valueRange;
		this.children = [];
		this.parent = null;
		this.type = hints.type || 'section';

		this._name = null;
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
		 * @param {Boolean} isLower Return name in lower-case
		 */
		name: function(isLower) {
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

			if (isLower) {
				if (this._nameLower === null) {
					this._nameLower = this._name.toLowerCase();
				}

				return this._nameLower;
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
			if (!this.parent) {
				return this;
			}

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

		/**
		 * Returns range of currect node
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
			var h = this._hints;
			var tokens = this.root().tokens;
			if (tokens && 'startToken' in h && 'endToken' in h) {
				var startToken = tokens[h.startToken];
				var endToken = tokens[h.endToken];
				return range.create2(startToken.start, endToken.end);
			}
		},

		toSource: function() {
			return this.range().substring(this.source()).trim();
		},

		toFullSource: function() {
			return this.fullRange().substring(this.source());
		},

		/**
		 * Returns original CSS source
		 * @return {String}
		 */
		source: function() {
			var root = this.root();
			if (root._dirty) {
				root._source = cssParser.toSource(root.tokens);
				root._dirty = false;
			}
			return root._source;
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
		_allSiblings: function() {
			var out = [], ctx = this, children;

			var add = function(item) {
				out.push(item);
				for (var i = 0, il = item.children.length; i < il; i++) {
					add(item.children[i]);
				}
			};

			while (ctx.parent) {
				children = ctx.parent.children;
				for (var i = _.indexOf(children, ctx) + 1, il = children.length; i < il; i++) {
					add(children[i]);
				}

				ctx = ctx.parent;
				if (ctx) {
					out.push(ctx);
				}
			}

			// console.log('All: %d (%d)', out.length, _.uniq(out).length);
			return out;
		},

		/**
		 * Returns index of current node in parent's child list
		 * @return {[type]} [description]
		 */
		index: function() {
			return this.parent ? this.parent.children.indexOf(this) : 0;
		},

		/**
		 * Removes current node from tree
		 */
		remove: function() {
			if (!this.parent) {
				return;
			}
			
			var tokenStart = this._hints.startToken;
			var tokenEnd = this._hints.endToken;
			var tokenOffset = tokenEnd - tokenStart + 1;

			var tokens = this.root().tokens;
			var charStart = tokens[tokenStart].start;
			var endChar = tokens[tokenEnd].end;
			var charOffset = endChar - charStart;

			var siblings = this._allSiblings();
			var pos = this.index();
			this.parent.children.splice(pos, 1);

			shiftPositions(siblings, {
				tokenStart: tokenStart,
				tokenOffset: -tokenOffset,
				charStart: charStart,
				charOffset: -charOffset
			});

			// update actual tokens
			var removed = tokens.splice(tokenStart, tokenOffset);
			for (var i = tokenStart, il = tokens.length, t; i < il; i++) {
				t = tokens[i];
				t.start -= charOffset;
				t.end -= charOffset;
			}

			this.root()._dirty = true;
		},

		/**
		 * Inserts given subtree into specified child position
		 * of current node.
		 * The given node must be attached to another tree with
		 * proper tokens and ranges
		 * @param {CSSNode} node
		 * @param {Number} pos Position index where node should be inserted.
		 * If not specified, node will be inserted at the end
		 */
		insert: function(subtree, pos) {
			if (_.isUndefined(pos)) {
				pos = this.children.length;
			}

			// identify original token where subtree tokens
			// should be inserted
			var tokens = this.root().tokens, siblings;
			var targetToken = null;
			if (!this.parent && pos === 0)  {
				targetToken = this.children.length ? 0 : tokens.length;
			} else if (this.children[pos]) {
				siblings = this.children[pos]._allSiblings();
				siblings.unshift(this.children[pos]);
				targetToken = this.children[pos]._hints.startToken;
			} else {
				// TODO find better location for subsection insertion
				if (!this.parent) {
					// for root section, subtree must be inserted at the end
					// of tokens list
					targetToken = this._hints.endToken + 1;
				} else {
					targetToken = this._hints.endToken;
					while (targetToken >= 0 && tokens[targetToken].type !== '}') {
						targetToken--;
					}

					if (targetToken <= this._hints.startToken) {
						throw "Invalid CSS section";
					}
				}

				siblings = this._allSiblings();
			}

			if (targetToken === null || _.isUndefined(targetToken)) {
				throw 'Unable to insert subtree: target token is unavailable';
			}

			// modify subtree tokens to match original tree tokens positions
			var subtreeSourceLen = 0, startPos;
			if (targetToken >= tokens.length) {
				startPos = (_.last(tokens) || tokenStub).end;
			} else {
				startPos = tokens[targetToken].start
			}

			var subtreeTokens = _.map(subtree.tokens, function(t) {
				t = _.clone(t);
				t.start += startPos;
				t.end += startPos;
				subtreeSourceLen += t.value.length;
				return t;
			});

			// update original tokens positions
			for (var i = targetToken, il = tokens.length; i < il; i++) {
				tokens[i].start += subtreeSourceLen;
				tokens[i].end += subtreeSourceLen;
			}

			// update subtree ranges
			shiftPositions(subtree.all(), {
				tokenStart: 0,
				tokenOffset: targetToken,
				charStart: 0,
				charOffset: targetToken && tokens[targetToken - 1] ? tokens[targetToken - 1].end : 0
			});

			// update sibling's ranges
			shiftPositions(siblings, {
				tokenStart: targetToken,
				tokenOffset: subtreeTokens.length,
				charStart: startPos,
				charOffset: subtreeSourceLen
			});
			
			// inject new tokens
			subtreeTokens.unshift(targetToken, 0);
			tokens.splice.apply(tokens, subtreeTokens);

			// inject subtree
			this.children.splice.apply(this.children, [pos, 0].concat(subtree.children));
			var parent = this;
			subtree.children.forEach(function(item) {
				item.parent = parent;
			});

			var root = this.root();
			root._hints.endToken = tokens.length - 1;
			root._dirty = true;
		},

		/**
		 * Replaces current node with given subtree
		 * @param  {CSSNode} subtree
		 */
		replace: function(subtree) {
			var ix = this.index();
			var parent = this.parent;
			this.remove();
			return parent.insert(subtree, ix);
		}
	};

	function TokenIterator(tokens, source) {
		this.tokens = tokens;
		this.len = tokens.length;
		this.source = source;
		this.start = this.pos = 0;
		this.root = new CSSNode(null, null, {
			type: 'root',
			startToken: 0,
			endToken: this.len - 1
		});
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

	function dumpTokens(tokens) {
		return tokens.map(function(item) {
			return '[' + item.value.replace(/\n/g, '<LF>').replace(/\t/g, '<TAB>') + ']';
		}).join(' ');
	}

	/**
	 * Updates positions of given nodes list. Used to
	 * update node's tokens and ranges if its tree is modified
	 * @param  {Array} items   List of nodes to update
	 * @param  {Object} options
	 */
	function shiftPositions(items, options) {
		var shiftToken = function(obj, prop) {
			if (obj[prop] >= options.tokenStart) {
				obj[prop] += options.tokenOffset;
				if (obj[prop] < 0) {
					obj[prop] = 0;
				}
			}
		}
		_.each(items, function(item) {
			// update tokens
			var h = item._hints;
			shiftToken(h, 'startToken');
			shiftToken(h, 'endToken');

			if (h.name) {
				shiftToken(h.name, 0);
				shiftToken(h.name, 1);
			}

			// update ranges
			var r = item.nameRange;
			if (item.nameRange) {
				if (r.start >= options.charStart) {
					r.start += options.charOffset;
				}
				if (r.end >= options.charStart) {
					r.end += options.charOffset;
				}
			}

			if (item.valueRange) {
				r = item.valueRange;
				if (r.start >= options.charStart) {
					r.start += options.charOffset;
				}
				if (r.end >= options.charStart) {
					r.end += options.charOffset;
				}
			}
		});
	}

	/**
	 * Normalizes selector
	 * @param  {String} sel
	 * @return {String}
	 */
	function normalizeSelector(sel) {
		return sel.trim().replace(reSpaces, ' ');
	}

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
				selectors.push(normalizeSelector(cur));
				cur = '';
			} else if (t.type === 'line') {
				cur += ' ';
			} else {
				cur += t.value;
			}
		}

		selectors.push(normalizeSelector(cur));
		return _.compact(selectors);
	}

	/**
	 * Skips formatting tokens from current position
	 * @param {TokenIterator} tokens
	 * @param {Object} info
	 */
	function skipFormatting(iter) {
		return skipTokens(iter, fTokens);
	}

	/**
	 * Skips shitespace tokens from current position
	 * @param {TokenIterator} tokens
	 * @param {Object} info
	 */
	function skipWhitespace(iter) {
		return skipTokens(iter, sTokens);
	}

	function skipTokens(iter, tokenTypes) {
		var t, shifted = false;
		while ((t = iter.peek()) && t.type in tokenTypes) {
			shifted = true;
			iter.next();
		}

		return shifted;
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
					var tok = fullRange.substring(iter.source);
					var ruleName = tok.match(/^@?\w+/)[0];
					var s = fullRange.start;
					fullRange.start += ruleName.length;
					var hints = {
						startToken: iter.start,
						endToken: iter.pos
					};

					iter.ctx.addChild(new CSSNode(range.create2(s, fullRange.start), fullRange, hints));
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
					var child = iter.ctx.addChild(new CSSNode(nameRange, null, {name: nameTokens, startToken: nameTokens[0]}));
					iter.ctx = child;
					consumeSection(iter);
					iter.ctx = iter.ctx.parent;

					var endPos, endToken;
					if (iter.peek()) {
						endPos = iter.peek().end;
						endToken = iter.pos;
					} else {
						endToken = iter.tokens.length - 1;
						endPos = iter.tokens[endToken].end;
					}

					child.valueRange = range.create2(token.start, endPos);
					child._hints.endToken = endToken;
					iter.next();
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

					var endToken = iter.pos;
					if (iter.peek().type === '}') {
						endToken--;
					}

					iter.ctx.addChild(new CSSNode(nameRange, valueRange, {
						type: 'property', 
						name: nameTokens,
						startToken: nameTokens[0],
						endToken: endToken
					}));
					
					if (iter.peek().type === ';') {
						iter.next();	
					}
					
					skipFormatting(iter);
					iter.start = iter.pos;
				}
			} else if (token.type === '}') {
				iter.next();
				skipWhitespace(iter);
				iter.backUp(1);
				return;
			} else {
				iter.next();
			}
		}
	}

	/**
	 * Validate tokens of parsed CSS. 
	 * Before parsing CSS into tree, we have to make sure that
	 * tokens are consistent enough to build valid tree. 
	 * Otherwise, incorrectly constructed tree may produce
	 * a lot of noise when patching
	 * @param  {Array} tokens CSS tokens
	 */
	function validateTokens(tokens) {
		var braces = 0;
		_.each(tokens, function(tok) {
			if (tok.type === '{') {
				braces++;
			} else if (tok.type === '}') {
				braces--;
			}
		});

		if (braces) {
			throw 'Invalid CSS structure';
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

			validateTokens(tokens);
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