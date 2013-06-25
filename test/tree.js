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

	it('should properly modify tree when removing nodes', function() {
		var cssTree = tree.build(style1);
		var section = cssTree.children[1];
		cssTree.children[1].remove();

		var sections = [
			['@import', [0, 7]],
			['.btn:hover', [66, 77]],
			['@media print', [139, 152]],
			['@media all and (min-height: 300px)', [243, 278]],
			['ul', [454, 456]]
		];

		cssTree.children.forEach(function(item, i) {
			assert.equal(item.name(), sections[i][0]);
			assert.deepEqual(item.nameRange.toArray(), sections[i][1]);
		});

		var innerSectionProps = [
			['padding', [290, 297]],
			['margin', [307, 313]],
			['background', [322, 332]],
			['background', [374, 384]]
		];

		var innerSection = locator.locate(cssTree, '@media all and (min-height: 300px)/body');
		innerSection.children.forEach(function(item, i) {
			assert.equal(item.name(), innerSectionProps[i][0]);
			assert.deepEqual(item.nameRange.toArray(), innerSectionProps[i][1]);
		});
	});

	it('should properly modify tree when inserting nodes', function() {
		var cssTree = tree.build(style1);
		var subtree = tree.build('blockquote {\n\tpadding: 10px;\n}\n  ');

		var child = cssTree.children[3];
		child.insert(subtree, 1);

		var topSections = [
			['@import', [0, 7]],
			['div, blockquote', [65, 129]],
			['.btn:hover', [164, 175]],
			['@media print', [237, 250]],
			['@media all and (min-height: 300px)', [656, 691]],
			['ul', [867, 869]]
		];

		cssTree.children.forEach(function(item, i) {
			assert.equal(item.name(), topSections[i][0]);
			assert.deepEqual(item.nameRange.toArray(), topSections[i][1]);
		});

		var childSections = [
			['@import', [254, 261]],
			['blockquote', [282, 293]],
			['BODY', [282, 287]],
			['body', [309, 314]]
		];
		child.children.forEach(function(item, i) {
			assert.equal(item.name(), childSections[i][0]);
			assert.deepEqual(item.nameRange.toArray(), childSections[i][1]);
		});

		// modify empty tree
		var empty = tree.build('');
		empty.insert(tree.build('a{b:c}'));
		assert.equal(empty.source(), 'a{b:c}');

		// modify empty subsection
		empty = tree.build('@media print{}');
		empty.children[0].insert(tree.build('a{b:c}'));
		assert.equal(empty.source(), '@media print{a{b:c}}');
	});
});