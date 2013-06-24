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
	var style3 = readCSS('css/style3.css');
	var invalid = readCSS('css/invalid.css');

	it('should parse CSS', function() {
		var cssTree1 = tree.build(style1);
		var cssTree2 = tree.build(style2);
		var topLevelSections = [
			'@import', 
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

	it('should parse invalid CSS', function() {
		var invCSS = tree.build(invalid);
		var allProps = [];
		invCSS.children.forEach(function(s) {
			s.children.forEach(function(p) {
				allProps.push(p.name());
			});
		});

		assert(true);
	});

	it('should import/export tree to JSON', function() {
		var cssTree = tree.build(style1);
		var treeJSON = cssTree.toJSONCache();
		var restoredTree = tree.fromJSONCache(treeJSON);

		assert.equal(restoredTree.children[0].name(), '@import');
		assert.equal(restoredTree.children[0].value(), 'url(sample.css)');

		var node = locator.locate(restoredTree, '@media print/body|2');
		assert.equal(node.name(), 'body');
		assert.equal(node.children[0].name(), 'padding');
		assert.equal(node.children[0].value(), '10px');
	});

	it('should store proper source tokens', function() {
		var cssTree = tree.build(style3);
		var topSectionRanges = [
			[0, 17],
			[18, 42],
			[44, 90],
			[91, 110],
			[111, 154],
			[155, 232],
			[233, 291],
			[292, 321],
			[322, 348],
			[349, 500],
			[501, 552],
			[553, 720]
		];

		var valueRanges = [
			[170, 180],
			[182, 198],
			[200, 230]
		];

		var innerRanges = [
			[368, 392],
			[393, 412],
			[439, 464],
			[465, 498]
		];

		cssTree.children.forEach(function(child, i) {
			assert.deepEqual(child.fullRange().toArray(), topSectionRanges[i]);
		});

		cssTree.children[5].children.forEach(function(child, i) {
			assert.deepEqual(child.fullRange().toArray(), valueRanges[i]);
		});

		cssTree.children[9].children.forEach(function(child, i) {
			assert.deepEqual(child.fullRange().toArray(), innerRanges[i]);
		});
	});
});