define(function() {
	var session = {tokens: null};
	
	// walks around the source
	var walker = {
		init: function (source) {
			this.source = source.replace(/\r\n?/g, '\n');
			this.ch = '';
			this.chnum = -1;
		
			// advance
			this.nextChar();
		},
		nextChar: function () {
			return this.ch = this.source.charAt(++this.chnum);
		},
		peek: function() {
			return this.source.charAt(this.chnum + 1);
		}
	};

	// utility helpers
	function isNameChar(c) {
		// & is for LESS syntax
		// return (c === '&' && c === '_' || c === '-' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'));
		var cc = c.charCodeAt(0);
		return ((cc >= 97 && cc <= 122 /* a-z */) || (cc >= 65 && cc <= 90 /* A-Z */) || c === '&' || c === '_' || c === '-');
	}

	function isDigit(c) {
		var cc = c.charCodeAt(0);
		// return (c >= '0' && c <= '9');
		return (cc >= 48 && cc <= 57);
	}

	var isOp = (function () {
		var opsa = "{}[]()+*=.,;:>~|\\%$#@^!".split(''),
			opsmatcha = "*^|$~".split(''),
			ops = {},
			opsmatch = {},
			i = 0;
		for (; i < opsa.length; i += 1) {
			ops[opsa[i]] = true;
		}
		for (i = 0; i < opsmatcha.length; i += 1) {
			opsmatch[opsmatcha[i]] = true;
		}
		return function (ch, matchattr) {
			if (matchattr) {
				return ch in opsmatch;
			}
			return ch in ops;
		};
	}());
	
	// creates token objects and pushes them to a list
	function tokener(value, type) {
		session.tokens.push({
			value: value,
			type:  type || value,
			start: -1,
			end:   -1
		});
	}
	
	// oops
	function error(m) { 
		var w = walker;
		var tokens = session.tokens;
		session.tokens = null;
		return {
			name: "ParseError",
			message: m + " at char " + (w.chnum + 1),
			walker: w,
			tokens: tokens
		};
	}


	// token handlers follow for:
	// white space, comment, string, identifier, number, operator
	function white() {
		var c = walker.ch,
			token = '';
	
		while (c === " " || c === "\t") {
			token += c;
			c = walker.nextChar();
		}
	
		tokener(token, 'white');
	
	}

	function comment() {
	
		var w = walker,
			c = w.ch,
			token = c,
			cnext;
	 
		cnext = w.nextChar();

		if (cnext === '/') {
			// inline comment in SCSS and such
			token += cnext;
			var pk = w.peek();
			while (pk && pk !== '\n') {
				token += cnext;
				cnext = w.nextChar();
				pk = w.peek();
			}
		} else if (cnext === '*') {
			// multiline CSS commment
			while (!(c === "*" && cnext === "/")) {
				token += cnext;
				c = cnext;
				cnext = w.nextChar();        
			}            
		} else {
			// oops, not a comment, just a /
			return tokener(token, token);
		}
		
		token += cnext;
		w.nextChar();
		tokener(token, 'comment');
	}

	function str() {
		var w = walker,
			c = w.ch,
			q = c,
			token = c,
			cnext;
	
		c = w.nextChar();
	
		while (c !== q) {
			
			if (c === '\n') {
				cnext = w.nextChar();
				if (cnext === "\\") {
					token += c + cnext;
				} else {
					// end of line with no \ escape = bad
					throw error("Unterminated string");
				}
			} else {
				if (c === "\\") {
					token += c + w.nextChar();
				} else {
					token += c;
				}
			}
		
			c = w.nextChar();
		
		}
		token += c;
		w.nextChar();
		tokener(token, 'string');
	}
	
	function brace() {
		var w = walker,
			c = w.ch,
			depth = 0,
			token = c;
	
		c = w.nextChar();
	
		while (c !== ')' && !depth) {
			if (c === '(') {
				depth++;
			} else if (c === ')') {
				depth--;
			} else if (c === '') {
				throw error("Unterminated brace");
			}
			
			token += c;
			c = w.nextChar();
		}
		
		token += c;
		w.nextChar();
		tokener(token, 'brace');
	}

	function identifier(pre) {
		var c = walker.ch;
		var token = pre ? pre + c : c;
			
		c = walker.nextChar();
		while (isNameChar(c) || isDigit(c)) {
			token += c;
			c = walker.nextChar();
		}
	
		tokener(token, 'identifier');    
	}

	function num() {
		var w = walker,
			c = w.ch,
			token = c,
			point = token === '.',
			nondigit;
		
		c = w.nextChar();
		nondigit = !isDigit(c);
	
		// .2px or .classname?
		if (point && nondigit) {
			// meh, NaN, could be a class name, so it's an operator for now
			return tokener(token, '.');    
		}
		
		// -2px or -moz-something
		if (token === '-' && nondigit) {
			return identifier('-');
		}
	
		while (c !== '' && (isDigit(c) || (!point && c === '.'))) { // not end of source && digit or first instance of .
			if (c === '.') {
				point = true;
			}
			token += c;
			c = w.nextChar();
		}

		tokener(token, 'number');    
	
	}

	function op() {
		var w = walker,
			c = w.ch,
			token = c,
			next = w.nextChar();
			
		if (next === "=" && isOp(token, true)) {
			token += next;
			tokener(token, 'match');
			w.nextChar();
			return;
		} 
		
		tokener(token, token);
	}


	// call the appropriate handler based on the first character in a token suspect
	function tokenize() {
		var ch = walker.ch;
	
		if (ch === " " || ch === "\t") {
			return white();
		}

		if (ch === '/') {
			return comment();
		} 

		if (ch === '"' || ch === "'") {
			return str();
		}
		
		if (ch === '(') {
			return brace();
		}
	
		if (ch === '-' || ch === '.' || isDigit(ch)) { // tricky - char: minus (-1px) or dash (-moz-stuff)
			return num();
		}
	
		if (isNameChar(ch)) {
			return identifier();
		}

		if (isOp(ch)) {
			return op();
		}
		
		if (ch === "\n") {
			tokener(ch, "line");
			walker.nextChar();
			return;
		}
		
		throw error("Unrecognized character '" + ch + "'");
	}
	
	/**
	 * Returns newline character at specified position in content
	 * @param {String} content
	 * @param {Number} pos
	 * @return {String}
	 */
	function getNewline(content, pos) {
		var ch = content.charAt(pos);
		return ch == '\r' && content.charAt(pos + 1) == '\n' 
			? '\r\n' 
			: ch;
	}

	return {
		/**
		 * @param source
		 * @returns
		 * @memberOf emmet.cssParser
		 */
		lex: function (source) {
			walker.init(source);
			session.tokens = [];
			while (walker.ch !== '') {
				tokenize();            
			}

			var tokens = session.tokens;
			session.tokens = null;
			return tokens;
		},
		
		/**
		 * Tokenizes CSS source
		 * @param {String} source
		 * @returns {Array}
		 */
		parse: function(source) {
			// transform tokens
			var pos = 0;
			var tokens = this.lex(source), token;
			for (var i = 0, il = tokens.length; i < il; i++) {
				token = tokens[i];
				if (token.type === 'line') {
					token.value = getNewline(source, pos);
				}

				token.start = pos;
				token.end = (pos += token.value.length);
			}
			return tokens;
		},
		
		toSource: function(toks) {
			var i = 0, max = toks.length, t, src = '';
			for (; i < max; i += 1) {
				src += toks[i].value;
			}
			return src;
		}
	};
});