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

var patch = rjs('patch');
var tree = rjs('tree');
var cssParser = rjs('cssParser');

function readCSS(cssPath) {
	return fs.readFileSync(path.join(__dirname, cssPath), 'utf8');
}

describe('Performance', function() {
	var style1 = readCSS('css/inn-blocks.css');
	var style2 = readCSS('css/style4.css');
	var tokens, cssTree;

	it('of tree builder for avg. CSS file', function() {
		cssTree = tree.build(style2);
		assert(true);
	});

	it('of CSS parser', function() {
		tokens = cssParser.parse(style1);
		assert(true);
	});

	it('of CSS Tree', function() {
		cssTree = tree.build(tokens);
		assert(true);
	});

	it('of applied patch', function() {
		patch.patch(cssTree, {
			"path": ".bmainpagefeatures__eitem",
			"properties":[{
				"name": "font-size",
				"value": "21px",
				"index": 2
			}],
			"removed": []
		});

		assert(true);
	});

	it('of applied patch on text source', function() {
		patch.patch(style1, {
			"path": ".bmainpagefeatures__eitem",
			"properties":[{
				"name": "font-size",
				"value": "21px",
				"index": 2
			}],
			"removed": []
		});

		assert(true);
	});
});