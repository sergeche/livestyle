var fs = require('fs');
var path = require('path');
var assert = require('assert');
var tree = require('../lib/tree');
var locator = require('../lib/locator');

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
			[44, 91],
			[91, 111],
			[111, 155],
			[155, 233],
			[233, 292],
			[292, 322],
			[322, 349],
			[349, 501],
			[501, 553],
			[553, 720]
		];

		var valueRanges = [
			[170, 180],
			[182, 198],
			[200, 230]
		];

		var innerRanges = [
			[368, 393],
			[393, 413],
			[439, 465],
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
			['.btn:hover', [65, 76]],
			['@media print', [138, 151]],
			['@media all and (min-height: 300px)', [242, 277]],
			['ul', [453, 455]]
		];

		cssTree.children.forEach(function(item, i) {
			assert.equal(item.name(), sections[i][0]);
			assert.deepEqual(item.nameRange.toArray(), sections[i][1]);
		});

		var innerSectionProps = [
			['padding', [289, 296]],
			['margin', [306, 312]],
			['background', [321, 331]],
			['background', [373, 383]]
		];

		var innerSection = locator.locate(cssTree, '@media all and (min-height: 300px)/body');
		innerSection.children.forEach(function(item, i) {
			assert.equal(item.name(), innerSectionProps[i][0]);
			assert.deepEqual(item.nameRange.toArray(), innerSectionProps[i][1]);
		});
	});

	it('should properly modify tree when inserting nodes', function() {
		var cssTree = tree.build(style1);
		var subtree = tree.build('blockquote {\n\tpadding: 10px;\n  }\n  ');

		var child = cssTree.children[3];
		child.insert(subtree, 1);

		// console.log(cssTree.source());

		var topSections = [
			['@import', [0, 7]],
			['div, blockquote', [65, 129]],
			['.btn:hover', [164, 175]],
			['@media print', [237, 250]],
			['@media all and (min-height: 300px)', [376, 411]],
			['ul', [587, 589]]
		];

		cssTree.children.forEach(function(item, i) {
			assert.equal(item.name(), topSections[i][0]);
			assert.deepEqual(item.nameRange.toArray(), topSections[i][1]);
		});

		var childSections = [
			['@import', [254, 261]],
			['blockquote', [282, 293]],
			['BODY', [317, 322]],
			['body', [344, 349]]
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