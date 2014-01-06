var fs = require('fs');
var path = require('path');
var assert = require('assert');
var tree = require('../lib/tree');
var locator = require('../lib/locator');

function readCSS(cssPath) {
	return fs.readFileSync(path.join(__dirname, cssPath), 'utf8');
}

describe('Locator', function() {
	var style1 = readCSS('css/style1.css');
	var style2 = readCSS('css/style2.css');
	var cssTree1 = tree.build(style1);
	var cssTree2 = tree.build(style2);

	var less1 = readCSS('less/normalize.less');
	var lessTree1 = tree.build(less1);

	// it.only('should correctly convert tre to list', function() {
	// 	var lessTree2 = tree.build('table { th {font-weight: bold;} td {font-size: 12px;} }');
	// 	var list = locator.toList(lessTree2, {syntax: 'less'});
	// 	console.log(list.map(function(item) {
	// 		return item.pathString + ' (' + item.section.type + ')';
	// 	}));
	// });

	it('should parse CSS path', function() {
		assert.deepEqual(locator.parsePath('a/b'), [['a', 1], ['b', 1]]);
		assert.deepEqual(locator.parsePath('a|2/b'), [['a', 2], ['b', 1]]);
		assert.deepEqual(locator.parsePath('a|2 / b'), [['a', 2], ['b', 1]]);
		assert.deepEqual(locator.parsePath('a[href="/"]/b'), [['a[href="/"]', 1], ['b', 1]]);
		assert.deepEqual(locator.parsePath('a[href="/\\""]/b|3'), [['a[href="/\\""]', 1], ['b', 3]]);
	});

	it('should find node', function() {
		var node = locator.locate(cssTree1, '@media print/body|2');
		assert(node);
		assert.equal(node.name(), 'body', 'Located node has valid name');
		assert.equal(locator.pathForNode(node, true), '@media print/body|2', 'Path are equal');
	});

	it('should find node by position', function() {
		assert.equal(locator.locateByPos(cssTree1, 292).name(), 'font-size');
		assert.equal(locator.locateByPos(cssTree1, 311).name(), 'body');
		assert.equal(locator.locateByPos(cssTree1, 409).name(), 'margin');
	});

	it('should guess node location', function() {
		var loc = locator.guessLocation(cssTree2, 
			'@media all and (min-height: 300px)/div|2/margin');
		assert.equal(loc.node.name(), 'margin');

		loc = locator.guessLocation(cssTree1,
			'@media all and (min-height: 300px)/div|3/padding');
		assert.equal(loc.node.name(), 'padding');

		// partial match
		loc = locator.guessLocation(cssTree1, 
			'@media all and (min-height: 300px)/p/padding');
		assert.equal(loc.node.name(), '@media all and (min-height: 300px)');
		assert.deepEqual(loc.rest, [['p', 1], ['padding', 1]]);

		loc = locator.guessLocation(cssTree1, 
			'@media all and (min-height: 300px)/body/font-size');
		assert.equal(loc.node.name(), 'body');
		assert.deepEqual(loc.rest, [['font-size', 1]]);
	});

	it('should correctly parse LESS tree', function() {
		// we have to check the normalization process,
		// e.g. how LESS selectors are transformed to
		// internal paths
		
		var expected = ['.one', '.one .two', '.one|2', '.one .two|2', '.three', '.four', '.three|2', '.one|3', '.sample', '.sample .test'];
		var list = locator.toList(lessTree1, {skipPathPos: false, syntax: 'less'}).map(function(item) {
			return item.pathString;
		});

		assert.deepEqual(list, expected);
	});
});