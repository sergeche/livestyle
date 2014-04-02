var path = require('path');
var assert = require('assert');
var testUtils = require('../testUtils');
var tree = require('../../../lib/tree');
var diff = require('../../../lib/diff');
var patch = require('../../../lib/patch');
var locator = require('../../../lib/locator');

var scssResolver = require('../../../lib/preprocessor/scss/resolver');
var scssExpr = require('../../../lib/preprocessor/scss/expression');
var preprocessor = require('../../../lib/preprocessor/resolver');
var selector = require('../../../lib/preprocessor/selector');

function resolveSCSS(tree) {
	return scssResolver.resolve(tree).sectionList().filter(function(item) {
		return isEmpty(item);
	});
}

function resolveCSS(tree) {
	return tree.sectionList();
}

function p(dir) {
	return path.join(__dirname, dir);
}

function isEmpty(item) {
	// remove nodes with empty contents
	return item.node.children.length;
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

function convert(val) {
	if (Array.isArray(val)) {
		return val.map(convert);
	}

	if (typeof val == 'string' && /^\d+$/.test(val)) {
		return +val;
	}

	if (typeof val == 'object') {
		var out = {};
		Object.keys(val).forEach(function(k) {
			out[k] = convert(val[k]);
		});
		return out;
	}

	return val;
}

function parse(expr) {
	return convert(scssExpr.parse(expr));
}

describe('SCSS nesting', function() {
	iterate(testUtils.getTreeSet(p('nesting'), 'scss'));
});

describe('SCSS other', function() {
	iterate(testUtils.getTreeSet(p('other'), 'scss'));
});

describe('SCSS expression parser', function() {
	it('should parse lists', function() {
		assert.deepEqual(parse('1, 2, 3'), [1, 2, 3]);
		assert.deepEqual(parse('1 + 2, 3'), ['1 + 2', 3]);
		assert.deepEqual(parse('1  2 3'), [1, 2, 3]);
		assert.deepEqual(parse('1 2, 3 4'), [[1, 2], [3, 4]]);
		assert.deepEqual(parse('1, 2, 3 4'), [1, 2, [3, 4]]);
		assert.deepEqual(parse('(1 2) (3 4)'), [[1, 2], [3, 4]]);
		assert.deepEqual(parse('(1,)'), 1);
		assert.deepEqual(parse('(1, 2, 3 4)'), [1, 2, [3, 4]]);
	});

	it('should parse maps', function() {
		assert.deepEqual(parse('(a: b, c: d)'), {a: 'b', c: 'd'});
		assert.deepEqual(parse('(a: b, c: "d, e")'), {a: 'b', c: '"d, e"'});
	});

	it('should parse mixed data', function() {
		assert.deepEqual(parse('1, 2, (a: b, c: d)'), [1, 2, {a: 'b', c: 'd'}]);
		assert.deepEqual(parse('1, (a: (2, 3), c: d)'), [1, {a: [2, 3], c: 'd'}]);
	});
});

// describe('SCSS extend', function() {
// 	iterate(testUtils.getTreeSet(p('extend'), 'scss'));
// });

// describe('SCSS debug', function() {
// 	iterate(testUtils.getTreeSet(p('debug'), 'scss'));
// });

describe('SASS transformer', function() {
	it('should work', function() {
		var scssTree = tree.build(testUtils.readFile(p('debug/debug.scss')));
		var cssTree = scssResolver.resolve(scssTree);
		console.log('Result:');
		console.log(cssTree.toCSS());
	});
});