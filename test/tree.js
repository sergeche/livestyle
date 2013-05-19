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

describe('Tree Builder', function() {
	var style1 = fs.readFileSync(path.join(__dirname, 'css/style1.css'), 'utf8');

	it('should parse CSS', function(done) {
		rjs(['tree'], function(tree) {
			var cssTree = tree.build(style1);
			var topLevelSections = [
				'@import url(sample.css)', 
				'div, blockquote',
				'.btn:hover',
				'@media print',
				'@media all and (min-height: 300px)',
				'ul'
			];

			cssTree.children.forEach(function(item, i) {
				assert.equal(item.name(), topLevelSections[i], 'Section ' + i + ' is ' + topLevelSections[i]);
			});

			done();
		});
	});

	it('should work with CSS paths', function(done) {
		rjs(['tree', 'locator'], function(tree, locator) {
			var cssTree = tree.build(style1);
			var cssPath = JSON.stringify([
				['@media print', 1],
				['body', 2],
				['padding', 1]
			]);

			var node = locator.locate(cssTree, cssPath);
			assert(node, 'Node located');
			assert.equal(node.name(), 'padding', 'Located node has valid name');
			assert.equal(locator.createPath(node), cssPath, 'Path are equal');

			done();
		});
	});

	it('should locate node by position', function(done) {
		rjs(['tree', 'locator'], function(tree, locator) {
			var cssTree = tree.build(style1);
			assert.equal(locator.locateByPos(cssTree, 292).name(), 'font-size');
			assert.equal(locator.locateByPos(cssTree, 311).name(), 'body');
			assert.equal(locator.locateByPos(cssTree, 409).name(), 'margin');
			done();
		});
	});
});
