define(['lodash'], function(_) {
	var dummyObj = {}, session = {tokens: null};
	
	// walks around the source
	var walker = {
		lines: null,
		total_lines: 0,
		linenum: -1,
		line: '',
		ch: '',
		chnum: -1,
		init: function (source) {
			var me = walker;
		
			// source, yumm
			me.lines = source
				.replace(/\r\n/g, '\n')
				.replace(/\r/g, '\n')
				.split('\n');
			me.total_lines = me.lines.length;
		
			// reset
			me.chnum = -1;
			me.linenum = -1;
			me.ch = '';
			me.line = '';
		
			// advance
			me.nextLine();
			me.nextChar();
		},
		nextLine: function () {
			var me = this;
			me.linenum += 1;
			if (me.total_lines <= me.linenum) {
				me.line = false;
			} else {
				me.line = me.lines[me.linenum];
			}
			if (me.chnum !== -1) {
				me.chnum = 0;
			}
			return me.line;
		}, 
		nextChar: function () {
			var me = this;
			me.chnum += 1;
			while (me.line.charAt(me.chnum) === '') {
				if (this.nextLine() === false) {
					me.ch = false;
					return false; // end of source
				}
				me.chnum = -1;
				me.ch = '\n';
				return '\n';
			}
			me.ch = me.line.charAt(me.chnum);
			return me.ch;
		},
		peek: function() {
			return this.line.charAt(this.chnum + 1);
		}
	};

	// utility helpers
	function isNameChar (c) {
		// be more tolerate for name tokens: allow & character for LESS syntax
		return (c === '&' || c === '_' || c === '-' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'));
	};

	function isDigit (ch) {
		return (ch !== false && ch >= '0' && ch <= '9');
	};

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
	
	// shorthands
	function isset(v) {
		return typeof v !== 'undefined';
	}

	var _conf = {'char': null, line: null};

	function getConf() {
		// use global object to reduce garbage collection
		_conf['char'] = walker.chnum;
		_conf['line'] = walker.linenum;
		return _conf;
	}


	// creates token objects and pushes them to a list
	function tokener(value, type, conf) {
		var w = walker, c = conf || dummyObj;
		session.tokens.push({
			value:     value,
			type:      type || value,
			start:     -1,
			end:       -1
		});
	}
	
	// oops
	function error(m, config) { 
		var w = walker,
			conf = config || {},
			c = isset(conf['char']) ? conf['char'] : w.chnum,
			l = isset(conf.line) ? conf.line : w.linenum;

		var tokens = session.tokens;
		session.tokens = null;
		return {
			name: "ParseError",
			message: m + " at line " + (l + 1) + ' char ' + (c + 1),
			walker: w,
			tokens: tokens
		};
	}


	// token handlers follow for:
	// white space, comment, string, identifier, number, operator
	function white() {
	
		var c = walker.ch,
			token = '',
			conf = getConf();
	
		while (c === " " || c === "\t") {
			token += c;
			c = walker.nextChar();
		}
	
		tokener(token, 'white', conf);
	
	}

	function comment() {
	
		var w = walker,
			c = w.ch,
			token = c,
			cnext,
			conf = getConf();    
	 
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
			// conf.charend = conf['char'];
			// conf.lineend = conf.line;
			return tokener(token, token, conf);
		}
		
		token += cnext;
		w.nextChar();
		tokener(token, 'comment', conf);
	}

	function str() {
		var w = walker,
			c = w.ch,
			q = c,
			token = c,
			cnext,
			conf = getConf();
	
		c = w.nextChar();
	
		while (c !== q) {
			
			if (c === '\n') {
				cnext = w.nextChar();
				if (cnext === "\\") {
					token += c + cnext;
				} else {
					// end of line with no \ escape = bad
					throw error("Unterminated string", conf);
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
		tokener(token, 'string', conf);
	}
	
	function brace() {
		var w = walker,
			c = w.ch,
			depth = 0,
			token = c,
			conf = getConf();
	
		c = w.nextChar();
	
		while (c !== ')' && !depth) {
			if (c === '(') {
				depth++;
			} else if (c === ')') {
				depth--;
			} else if (c === false) {
				throw error("Unterminated brace", conf);
			}
			
			token += c;
			c = w.nextChar();
		}
		
		token += c;
		w.nextChar();
		tokener(token, 'brace', conf);
	}

	function identifier(pre) {
		var w = walker,
			c = w.ch,
			conf = getConf(),
			token = pre ? pre + c : c;
			
		c = w.nextChar();
	
		if (pre) { // adjust token position
			conf['char'] -= pre.length;
		}
		
		while (isNameChar(c) || isDigit(c)) {
			token += c;
			c = w.nextChar();
		}
	
		tokener(token, 'identifier', conf);    
	}

	function num() {
		var w = walker,
			c = w.ch,
			conf = getConf(),
			token = c,
			point = token === '.',
			nondigit;
		
		c = w.nextChar();
		nondigit = !isDigit(c);
	
		// .2px or .classname?
		if (point && nondigit) {
			// meh, NaN, could be a class name, so it's an operator for now
			// conf.charend = conf['char'];
			// conf.lineend = conf.line;
			return tokener(token, '.', conf);    
		}
		
		// -2px or -moz-something
		if (token === '-' && nondigit) {
			return identifier('-');
		}
	
		while (c !== false && (isDigit(c) || (!point && c === '.'))) { // not end of source && digit or first instance of .
			if (c === '.') {
				point = true;
			}
			token += c;
			c = w.nextChar();
		}

		tokener(token, 'number', conf);    
	
	}

	function op() {
		var w = walker,
			c = w.ch,
			conf = getConf(),
			token = c,
			next = w.nextChar();
			
		if (next === "=" && isOp(token, true)) {
			token += next;
			tokener(token, 'match', conf);
			w.nextChar();
			return;
		} 
		
		// conf.charend = conf['char'] + 1;
		// conf.lineend = conf.line;    
		tokener(token, token, conf);
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
			tokener("line");
			walker.nextChar();
			return;
		}
		
		throw error("Unrecognized character");
	}
	
	/**
	 * Returns newline character at specified position in content
	 * @param {String} content
	 * @param {Number} pos
	 * @return {String}
	 */
	function getNewline(content, pos) {
		return content.charAt(pos) == '\r' && content.charAt(pos + 1) == '\n' 
			? '\r\n' 
			: content.charAt(pos);
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
			while (walker.ch !== false) {
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
		
		toSource: function (toks) {
			var i = 0, max = toks.length, t, src = '';
			for (; i < max; i += 1) {
				t = toks[i];
				if (t.type === 'line') {
					src += '\n';
				} else {
					src += t.value;
				}
			}
			return src;
		}
	};
});