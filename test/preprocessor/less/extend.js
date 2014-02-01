var _ = require('lodash');
var path = require('path');
var assert = require('assert');
var testUtils = require('../testUtils');
var tree = require('../../../lib/tree');
var lessResolver = require('../../../lib/preprocessor/less/resolver');
var preprocessor = require('../../../lib/preprocessor/resolver');
var selector = require('../../../lib/preprocessor/selector');

describe('LESS extend', function() {
	function np(ix, path) {
		return 'Rule ' + (ix + 1) + ': ' + selector.normalize(path.join(' / '));
	}

	function isEmpty(item) {
		// remove nodes with empty contents
		return item.node.properties().filter(function(item) {
			return item.name !== '&';
		}).length;
	}

	testUtils.getTreeSet(path.join(__dirname, 'extend'), 'less').slice(0, 4).forEach(function(item) {
		it('on file ' + item.preprocessor, function() {
			var less = lessResolver.resolve(item.preprocessor).filter(function(item) {
				return isEmpty(item);
			});
			var css = preprocessor.resolve(item.css);

			// console.log(_.pluck(css, 'path'));
			less.forEach(function(item, i) {
				assert.deepEqual(np(i, item.path), np(i, css[i].path));
			});
		});
	});
});