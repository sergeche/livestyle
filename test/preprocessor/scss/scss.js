var path = require('path');
var assert = require('assert');
var testUtils = require('../testUtils');
var tree = require('../../../lib/tree');
var diff = require('../../../lib/diff');
var patch = require('../../../lib/patch');
var locator = require('../../../lib/locator');

var scssResolver = require('../../../lib/preprocessor/scss/resolver');
var preprocessor = require('../../../lib/preprocessor/resolver');
var selector = require('../../../lib/preprocessor/selector');

function resolveSCSS(tree) {
	return scssResolver.resolve(tree).filter(function(item) {
		return isEmpty(item);
	});
}

function resolveCSS(tree) {
	return preprocessor.resolve(tree);
}

function p(dir) {
	return path.join(__dirname, dir);
}

function isEmpty(item) {
	// remove nodes with empty contents
	return item.node.properties().filter(function(item) {
		return item.name !== '&' && item.name.charAt(0) !== '@';
	}).length;
}

function np(ix, path) {
	return 'Rule ' + (ix + 1) + ': ' + selector.normalize(path.join(' / '));
}

function iterate(treeSet) {
	treeSet.forEach(function(item) {
		it('on file ' + item.preprocessorFile, function() {
			var less = resolveSCSS(item.preprocessor);
			var css = resolveCSS(item.css);

			// console.log(_.pluck(less, 'path'));
			less.forEach(function(item, i) {
				assert.deepEqual(np(i, item.path), np(i, css[i].path));
			});
		});
	});
}

describe('SCSS nesting', function() {
	iterate(testUtils.getTreeSet(p('nesting'), 'scss'));
});

describe('SCSS extend', function() {
	iterate(testUtils.getTreeSet(p('extend'), 'scss'));
});