var fs = require('fs');
var rjs = require('requirejs');
var path = require('path');
var assert = require('assert');

rjs.config({
	baseUrl: path.resolve(__dirname, '../lib'),
	paths: {
		lodash: 'vendor/lodash'
	}
});

var tree = rjs('tree');
var locator = rjs('locator');

function readCSS(cssPath) {
	return fs.readFileSync(path.join(__dirname, cssPath), 'utf8');
}

describe('Locator', function() {
	var style1 = readCSS('css/style1.css');
	var style2 = readCSS('css/style2.css');
	var cssTree1 = tree.build(style1);
	var cssTree2 = tree.build(style2);

	it('should parse CSS path', function() {
		assert.deepEqual(locator.parsePath('a/b'), [['a', 1], ['b', 1]]);
		assert.deepEqual(locator.parsePath('a|2/b'), [['a', 2], ['b', 1]]);
		assert.deepEqual(locator.parsePath('a|2 / b'), [['a', 2], ['b', 1]]);
		assert.deepEqual(locator.parsePath('a[href="/"]/b'), [['a[href="/"]', 1], ['b', 1]]);
		assert.deepEqual(locator.parsePath('a[href="/\\""]/b|3'), [['a[href="/\\""]', 1], ['b', 3]]);
	});

	it('should find node', function() {
		var node = locator.locate(cssTree1, '@media print/body|2/padding');
		assert(node, 'Node located');
		assert.equal(node.name(), 'padding', 'Located node has valid name');
		assert.equal(locator.createPath(node, true), '@media print/body|2/padding', 'Path are equal');
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
});