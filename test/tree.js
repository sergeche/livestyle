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

	it('should properly modify tree when removing nodes', function() {
		var cssTree = tree.build(style1);
		var section = cssTree.children[1];
		cssTree.children[1].remove();

		var sections = [
			['@import', [0, 7]],
			['.btn:hover', [65, 75]],
			['@media print', [138, 150]],
			['@media all and (min-height: 300px)', [242, 276]],
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
			['div, blockquote', [65, 104]],
			['.btn:hover', [164, 174]],
			['@media print', [237, 249]],
			['@media all and (min-height: 300px)', [376, 410]],
			['ul', [587, 589]]
		];

		cssTree.children.forEach(function(item, i) {
			assert.equal(item.name(), topSections[i][0]);
			assert.deepEqual(item.nameRange.toArray(), topSections[i][1]);
		});

		var childSections = [
			['@import', [254, 261]],
			['blockquote', [282, 292]],
			['BODY', [317, 321]],
			['body', [344, 348]]
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