var rjs = require('requirejs');
var assert = require('assert');
var path = require('path');

rjs.config({
	baseUrl: path.resolve(__dirname, '../lib'),
	paths: {
		lodash: 'vendor/lodash'
	}
});

var tree = rjs('tree');
var locator = rjs('locator');
var sourcer = rjs('sourcer');

/**
 * Applies patch from sourcer module on given CSS content
 * @param  {String} content CSS content
 * @param  {Object} patch   Sourcer patch
 * @returns {String}
 */
function applyPatch(content, patch) {
	return content.substring(0, patch.range[0])
		+ patch.value
		+ content.substring(patch.range[1]);
}

/**
 * Locates node by given path in CSS source and 
 * applies transformation to it
 * @param  {String} content  CSS content
 * @param  {Array}  path     CSS location path
 * @param  {String} value    New value of CSS property
 * @return {String}
 */
function patch(content, path, value) {
	var update = sourcer.update(content, {
		path: path,
		value: value
	});

	if (update) {
		content = applyPatch(content, update);
	}

	return content;
}

describe('Sourcer', function() {
	it('should strictly match and update CSS property', function() {
		assert.equal(patch('a{b:1;}', [['a', 1], ['b', 1]], '2'), 'a{b:2;}');
		assert.equal(patch('c{b:1;} a{b:1;}', [['a', 1], ['b', 1]], '2'), 'c{b:1;} a{b:2;}');
		assert.equal(patch('c{b:1;} a{d:1;b:1;}', [['a', 1], ['b', 1]], '2'), 'c{b:1;} a{d:1;b:2;}');
		assert.equal(patch('a{b:abc}', [['a', 1], ['b', 1]], '3'), 'a{b:3}');
		assert.equal(patch('c{a{b:1}}', [['c', 1], ['a', 1], ['b', 1]], '2'), 'c{a{b:2}}');
	});

	it('should find best match and update CSS property', function() {
		assert.equal(patch('a{b:1;}', [['a', 2], ['b', 1]], '2'), 'a{b:2;}');
		assert.equal(patch('a{b:3;b:1;}', [['a', 2], ['b', 3]], '2'), 'a{b:3;b:2;}');
	});

	it('should create new sections with CSS property', function() {
		assert.equal(patch('a{b:1;}', [['c', 1], ['d', 1]], '2'), 'a{b:1;}\nc{d:2;}');
		assert.equal(patch('a {b:1;}', [['c', 1], ['d', 1], ['e', 1]], '2'), 'a {b:1;}\nc {d {e:2;}}');
	});

	it('should learn coding style', function() {
		assert.equal(patch('a {\n\tb:1;\n}', [['c', 1], ['d', 1]], '2'), 'a {\n\tb:1;\n}\nc {\n\td:2;\n}');
		assert.equal(patch('a\n{\n\tb: 1;\n\t}', [['c', 1], ['d', 1]], '2'), 'a\n{\n\tb: 1;\n\t}\nc\n{\n\td: 2;\n\t}');
		assert.equal(patch('a{\n\tb: 1;\n\t}', [['a', 1], ['d', 1]], '2'), 'a{\n\tb: 1;\n\td: 2;\n\t}');
		assert.equal(patch('a{b: 1}', [['a', 1], ['d', 1]], '2'), 'a{b: 1;d: 2;}');
		assert.equal(patch('', [['a', 1], ['b', 1], ['c', 1]], '1'), 'a {\n\tb {\n\t\tc: 1;\n\t}\n}');
	});

	it('should patch source', function() {
		var style1 = 'b{padding:10px}';
		var style2 = 'b{margin:10px;padding:5px;}';

		var patch = function(pos) {
			var p = sourcer.makePatch(style2, pos);
			return sourcer.applyPatch(style1, p);
		};

		assert.equal(patch(18), 'b{padding:5px}');
		assert.equal(patch(7), 'b{padding:10px;margin:10px;}');
		assert.equal(patch(26), 'b{padding:5px;margin:10px;}');
		assert.equal(patch(14), 'b{padding:5px;margin:10px;}');
	});
});