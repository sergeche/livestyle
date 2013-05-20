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

describe('Tree Builder', function() {
	var style1 = readCSS('css/style1.css');
	var style2 = readCSS('css/style2.css');
	var cssTree1 = tree.build(style1);
	var cssTree2 = tree.build(style2);

	it('should parse CSS', function() {
		var topLevelSections = [
			'@import url(sample.css)', 
			'div, blockquote',
			'.btn:hover',
			'@media print',
			'@media all and (min-height: 300px)',
			'ul'
		];

		cssTree1.children.forEach(function(item, i) {
			assert.equal(item.name(), topLevelSections[i], 'Section ' + i + ' is ' + topLevelSections[i]);
		});
	});

	it('should work with CSS paths', function() {
		var cssPath = JSON.stringify([
			['@media print', 1],
			['body', 2],
			['padding', 1]
		]);

		var node = locator.locate(cssTree1, cssPath);
		assert(node, 'Node located');
		assert.equal(node.name(), 'padding', 'Located node has valid name');
		assert.equal(locator.createPath(node), cssPath, 'Path are equal');
	});

	it('should locate node by position', function() {
		assert.equal(locator.locateByPos(cssTree1, 292).name(), 'font-size');
		assert.equal(locator.locateByPos(cssTree1, 311).name(), 'body');
		assert.equal(locator.locateByPos(cssTree1, 409).name(), 'margin');
	});

	it('should guess node location', function() {
		var loc = locator.guessLocation(cssTree2, [
			['@media all and (min-height: 300px)', 1],
			['div', 2],
			['margin', 1]
		]);
		assert.equal(loc.node.name(), 'margin');

		loc = locator.guessLocation(cssTree1, [
			['@media all and (min-height: 300px)', 1],
			['div', 3],
			['padding', 1]
		]);
		assert.equal(loc.node.name(), 'padding');

		// partial match
		loc = locator.guessLocation(cssTree1, [
			['@media all and (min-height: 300px)', 1],
			['p', 1],
			['padding', 1]
		]);
		assert.equal(loc.node.name(), '@media all and (min-height: 300px)');
		assert.deepEqual(loc.rest, [['p', 1], ['padding', 1]]);

		loc = locator.guessLocation(cssTree1, [
			['@media all and (min-height: 300px)', 1],
			['body', 1],
			['font-size', 1]
		]);
		assert.equal(loc.node.name(), 'body');
		assert.deepEqual(loc.rest, [['font-size', 1]]);
	});
});