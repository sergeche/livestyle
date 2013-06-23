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
});