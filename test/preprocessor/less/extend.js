var _ = require('lodash');
var path = require('path');
var assert = require('assert');
var testUtils = require('../../testUtils');
var tree = require('../../../lib/tree');
var lessResolver = require('../../../lib/preprocessor/less/resolver');
var preprocessor = require('../../../lib/preprocessor/resolver');
var selector = require('../../../lib/preprocessor/selector');

describe('LESS extend', function() {
	function np(ix, path) {
		return 'Rule ' + (ix + 1) + ': ' + selector.normalize(path.join(' / '));
	}

	function cleanUp(item) {
		// remove nodes with empty contents
		return item.node.properties().filter(function(item) {
			return item.name !== '&';
		}).length;
	}

	testUtils.getFileSet(path.join(__dirname, 'extend'), 'less').slice(0, 4).forEach(function(item) {
		it('on file ' + item.preprocessor, function() {
			var lessFile = testUtils.readFile(item.preprocessor);
			var cssFile = testUtils.readFile(item.css);

			var lessTree = tree.build(lessFile);
			var cssTree = tree.build(cssFile);
			
			var less = lessResolver.resolve(lessTree).filter(function(item) {
				// remove nodes with empty contents
				return !!cleanUp(item);
			});
			var css = preprocessor.resolve(cssTree);

			// console.log(_.pluck(css, 'path'));
			less.forEach(function(item, i) {
				assert.deepEqual(np(i, item.path), np(i, css[i].path));
			});
		});
	});
});