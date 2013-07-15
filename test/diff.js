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
		assert.deepEqual(getPaths('remove'), ['@import|3', 'b', 'c', 'd', '@keyframes test/50%'], 'Removed sections');

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

	it('should find difference in edge cases', function() {
		var patches = diff.diff('a{b:c} d{e:f}', 'a{b:c}');
		// console.log(JSON.stringify(patches));

		var getPaths = function(action) {
			return _.pluck(filter(patches, action), 'path');
		};

		assert.deepEqual(getPaths('remove'), ['d'], 'Removed sections');

		patches = diff.diff('a{b:c;d:e}', 'a{b:c}');
		assert.deepEqual(getPaths('update'), ['a']);
		assert.deepEqual(patches[0].removed.map(function(p) {
			return p.name;
		}), ['d']);


		patches = diff.diff('@import url(a);', '@import url(a);@import url(b);');
		assert.deepEqual(getPaths('add'), ['@import|2']);
		assert.equal(patches.length, 1);
		assert.equal(patches[0].value, 'url(b)');
	});

	it('simulates real user input', function() {
		var patches;
		var state1 = 'a{v:1} b{v:1} c{v:1} b{x:2}';
		var state2 = 'a{v:1} # b{v:1} c{v:1} b{x:2}';
		var state3 = 'a{v:1} #d b{v:1} c{v:1} b{x:2}';
		var state4 = 'a{v:1} #d{} b{v:1} c{v:1} b{x:2}';
		var state5 = 'a{v:1} c{v:1} b{x:2}';

		var getPaths = function(action) {
			return _.pluck(filter(patches, action), 'path');
		};

		patches = diff.diff(state1, state2);
		assert.deepEqual(getPaths('add'), ['# b']);
		assert.deepEqual(getPaths('remove'), ['b']);

		patches = diff.diff(state2, state3);
		assert.deepEqual(getPaths('add'), ['#d b']);
		assert.deepEqual(getPaths('remove'), ['# b']);

		patches = diff.diff(state3, state4);
		assert.deepEqual(getPaths('add'), ['#d', 'b']);
		assert.deepEqual(getPaths('remove'), ['#d b']);

		patches = diff.diff(state4, state5);
		assert.deepEqual(getPaths('add'), []);
		assert.deepEqual(getPaths('remove'), ['#d', 'b']);
	});
});