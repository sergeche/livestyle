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
		
		assert.equal(importSection.patch.value, 'url(style3.css)');
	});
});