var rjs = require('requirejs');
var assert = require('assert');
var path = require('path');
var fs = require('fs');

rjs.config({
	baseUrl: path.resolve(__dirname, '../lib'),
	paths: {
		lodash: 'vendor/lodash'
	}
});

function readCSS(cssPath) {
	return fs.readFileSync(path.join(__dirname, cssPath), 'utf8');
}

var diff = rjs('diff');
var locator = rjs('locator');
var _ = rjs('lodash');

describe('Diff', function() {
	var style1 = readCSS('css/diff1.css');
	var style2 = readCSS('css/diff2.css');

	var style3 = readCSS('css/style4.css');
	var style4 = readCSS('css/style4-diff.css');

	var filter = function(patches, action) {
		return patches
			.filter(function(p) {
				return p.action == action;
			})
			.map(function(p) {
				return {
					path: locator.stringifyPath(p.path),
					patch: p
				};
			});
	};

	it('should find difference between CSS sources', function() {
		var patches = diff.diff(style1, style2);
		// console.log(JSON.stringify(patches));

		var getPaths = function(action) {
			return _.pluck(filter(patches, action), 'path');
		};

		assert.deepEqual(getPaths('update'), ['@import|2', 'e', '@keyframes test/100%'], 'Updated sections');
		assert.deepEqual(getPaths('add'), ['b2', 'd2', 'f', '@keyframes test/40%'], 'Added sections');
		assert.deepEqual(getPaths('remove'), ['b', 'c', 'd', '@keyframes test/50%'], 'Removed sections');

		// compare contents of updated sections
		var importSection = _.find(filter(patches, 'update'), function(p) {
			return p.path == '@import|2';
		});
		
		var eSection = _.find(filter(patches, 'update'), function(p) {
			return p.path == 'e';
		});
		var eProps = {};
		_.each(eSection.patch.properties, function(p) {
			eProps[p.name] = p.value;
		})

		assert.equal(importSection.patch.value, 'url(style3.css)');
		assert.equal(eProps.position, 'absolute');
		assert.equal(eProps['font-size'], '12px');
	});

	it('should find difference between real-world CSS sources', function() {
		var patches = diff.diff(style3, style4);
		// console.log(JSON.stringify(patches));

		var getPaths = function(action) {
			return _.pluck(filter(patches, action), 'path');
		};

		assert.deepEqual(getPaths('update'), ['@import|2', '.page-header .h-section'], 'Updated sections');
		assert.deepEqual(getPaths('add'), ['.page-header2 .product-list-item'], 'Added sections');
		assert.deepEqual(getPaths('remove'), ['.page-header .product-list-item|2', '.page-header .product-list-author'], 'Removed sections');
	});
});