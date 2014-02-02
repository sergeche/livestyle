var _ = require('lodash');
var path = require('path');
var assert = require('assert');
var testUtils = require('../testUtils');
var tree = require('../../../lib/tree');
var lessResolver = require('../../../lib/preprocessor/less/resolver');
var preprocessor = require('../../../lib/preprocessor/resolver');
var selector = require('../../../lib/preprocessor/selector');

function isEmpty(item) {
	// remove nodes with empty contents
	return item.node.properties().filter(function(item) {
		return item.name !== '&';
	}).length;
}

function np(ix, path) {
	return 'Rule ' + (ix + 1) + ': ' + selector.normalize(path.join(' / '));
}

function resolveLESS(tree) {
	return lessResolver.resolve(tree).filter(function(item) {
		return isEmpty(item);
	});
}

function resolveCSS(tree) {
	return preprocessor.resolve(tree);
}

describe.only('LESS extend', function() {
	testUtils.getTreeSet(path.join(__dirname, 'extend'), 'less').slice(5, 6).forEach(function(item) {
		it('on file ' + item.preprocessorFile, function() {
			var less = resolveLESS(item.preprocessor);
			var css = resolveCSS(item.css);

			// console.log(_.pluck(less, 'path'));
			less.forEach(function(item, i) {
				assert.deepEqual(np(i, item.path), np(i, css[i].path));
			});
		});
	});
});

describe('LESS nesting', function() {
	testUtils.getTreeSet(path.join(__dirname, 'nesting'), 'less').forEach(function(item) {
		it('on file ' + item.preprocessorFile, function() {
			var less = resolveLESS(item.preprocessor);
			var css = resolveCSS(item.css);

			// console.log(_.pluck(less, 'path'));
			less.forEach(function(item, i) {
				assert.deepEqual(np(i, item.path), np(i, css[i].path));
			});
		});
	});
});