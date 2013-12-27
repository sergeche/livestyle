var fs = require('fs');
var path = require('path');
var assert = require('assert');
var parser = require('emmet/lib/parser/css');

function readCSS(cssPath) {
	return fs.readFileSync(path.join(__dirname, cssPath), 'utf8');
}

describe('CSS parser', function() {
	var css1 = readCSS('css/ayyo.css');
	var css2 = readCSS('css/inn-blocks.css');

	it('should parse valid CSS files', function() {
		parser.parse(css1);
		parser.parse(css2);
		assert(true);
	});

	it('should break on invalid CSS files', function() {
		var validateError = function(err, line, ch) {
			console.log(err.message);
			return err.name == 'ParseError' && err.line == line && err.ch == ch;
		}

		var invalidCSS1 = 'a{contet:—}';
		var invalidCSS2 = '.btn:hover {text-shadow: 0px 1px 1px rgba(0,0,0,0.2);color: #fff;}\nbody {padding: 22px;margin: 5px;background: url(./image.png) no-repeat 10px 10px;background: none;content: —;}';

		assert.throws(function() {
			parser.parse(invalidCSS1);
		}, function(e) {
			return validateError(e, 1, 10);
		});

		assert.throws(function() {
			parser.parse(invalidCSS2);
		}, function(e) {
			return validateError(e, 2, 108);
		});
	});
});