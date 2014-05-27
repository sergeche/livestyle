var _ = require('lodash');
var path = require('path');
var assert = require('assert');
var testUtils = require('../testUtils');
var tree = require('../../../lib/tree');
var diff = require('../../../lib/diff');
var patch = require('../../../lib/patch');
var locator = require('../../../lib/locator');
var lessResolver = require('../../../lib/preprocessor/less/resolver');
var preprocessor = require('../../../lib/preprocessor/resolver');
var selector = require('../../../lib/preprocessor/selector');
var lessCtx = require('../../../lib/preprocessor/less/context');

function readFile(filePath) {
	if (filePath.charAt(0) !== '/') {
		filePath = p(filePath);
	}
	return testUtils.readFile(filePath);
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

function resolveLESS(tree) {
	var processed = lessResolver.resolve(tree);
	return processed.sectionList().filter(function(item) {
		// check if current node contains empty sections
		for (var i = 0, il = item.node.children.length, c; i < il; i++) {
			c = item.node.children[i];
			if (c.type !== 'section' || c.children.length) {
				return true;
			}
		}

		return false;
	});
}

function resolveCSS(tree) {
	return tree.sectionList();
}

describe('LESS extend', function() {
	testUtils.getTreeSet(p('extend'), 'less').forEach(function(item) {
		it('on file ' + item.preprocessorFile, function() {
			var less = resolveLESS(item.preprocessor);
			var css = resolveCSS(item.css);

			less.forEach(function(item, i) {
				assert.deepEqual(np(i, item.path), np(i, css[i].path));
			});
		});
	});
});

describe('LESS nesting', function() {
	testUtils.getTreeSet(p('nesting'), 'less').forEach(function(item) {
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

describe('LESS generic', function() {
	var less1 = 'table { th {font-weight: bold;} td {@v: 12px; a: @v;} }';
	var less2 = 'table { th {font-weight: bold;} td {@v: 12px; a: @v + 2;} }';

	var less3 = '.section{ a{color:red; &:hover{color:blue;}} }';
	var less4 = '.section{ a{color:red; &:hover{color:green;}} }';

	var css1 = 'table td {a: 12px;}';
	var css2 = 'table td {padding: 10px}';

	var css3 = '.section a{color:red} .section a:hover{color:blue}';
	var css4 = '.section a{color:red} .section a:hover{color:green}';

	it('should diff two LESS sources', function() {
		var d = diff.diff(less1, less2, {syntax: 'less'});
		assert.equal(d.length, 1);
		assert.deepEqual(d[0].path, [['table td', 1]]);

		d = diff.diff(less3, less4, {syntax: 'less'});
		assert.equal(d.length, 1);
		assert.deepEqual(d[0].path, [['.section a:hover', 1]]);
	});

	it('should patch simple LESS expressions', function() {
		var less = '@v:12px; @c:#fc0; a {b: @v; c: @c; d: @v; e: 10px;}';
		var css = 'a {b: 14px; c: #fa0; d: 3em; e: 12px;}';
		var d = diff.diff(less, css, {syntax: 'less'});

		var patchedSource = patch.patch(less, d, {syntax: 'less'});
		assert.equal(patchedSource, '@v:12px; @c:#fc0; a {b: @v + 2px; c: @c - #002200; d: 3em; e: 12px;}');

		// check color keywords that collide with build-in functions
		less = 'a{color:red;}';
		css = 'a{color:blue;}';
		var d = diff.diff(less, css, {syntax: 'less'});

		patchedSource = patch.patch(less, d, {syntax: 'less'});
		assert.equal(patchedSource, 'a{color:blue;}');
	});

	it('should patch basic LESS expressions', function() {
		var less1 = '@v:12px; @c:#fc0; a {b: @v + 2 / 1; c: @c; d: lighten(@c, 10%); }';
		var css1 = 'a {b: 16px; c: #ffe066; d: #ffe066; }';

		var d = diff.diff(less1, css1, {syntax: 'less'});

		var patchedSource = patch.patch(less1, d, {syntax: 'less'});
		// console.log(patchedSource);
		assert.equal(patchedSource, '@v:12px; @c:#fc0; a {b: @v + 2 / 1 + 2px; c: @c + #001466; d: lighten(@c, 10%) + #000a33; }');
	});

	it.only('should resolve mixins', function() {
		var lessTree = lessResolver.resolve(readFile('common/resolve.less'));
		var sections = lessTree.sectionList();
		var propertiesFor = function(name) {
			for (var i = 0, il = sections.length; i < il; i++) {
				if (sections[i].name == name) {
					return sections[i].node.properties().map(function(p) {
						return p.name + ': ' + p.value;
					});
				}
			}
		};

		assert.deepEqual(propertiesFor('.item2'), ['height: 10px', 'width: 10px', 'left: 5px', 'right: 25px', 'height: 10px']);
		assert.deepEqual(propertiesFor('.item3'), ['right: 10px', 'height: 10px']);
		assert.deepEqual(propertiesFor('.item4'), ['color: red', 'right: 10px !important', 'height: 10px !important', 'background: blue']);
		assert.deepEqual(propertiesFor('.item5'), ['color: #1e3b59', 'right: #000000', 'height: 10px']);
		assert.deepEqual(propertiesFor('.item6'), ['background-color: black', 'color: #ddd']);
		assert.deepEqual(propertiesFor('.item7'), ['background-color: white', 'color: #555']);
	});

	it('should correctly split mixin arguments', function() {
		var split = function(expr) {
			return _.pluck(lessCtx.splitArgs(expr), 'name');
		};

		assert.deepEqual(split('a; b'), ['a', 'b']);
		assert.deepEqual(split('a, b'), ['a', 'b']);
		assert.deepEqual(split('a, b, c'), ['a', 'b', 'c']);
		assert.deepEqual(split('a, b; c'), ['a, b', 'c']);
		assert.deepEqual(split('a; b, c'), ['a', 'b, c']);
		assert.deepEqual(split('"a; b", c'), ['"a; b"', 'c']);
	});

	it('should use dependencies', function() {
		var lessFile1  = p('bootstrap/jumbotron.less');
		var lessFile2  = p('bootstrap/modals.less');
		var varsFile   = p('bootstrap/variables.less');
		var mixinsFile = p('bootstrap/mixins.less');

		var options = {
			file: lessFile1,
			syntax: 'less',
			deps: [{
				url: varsFile,
				crc: 'abc',
				content: readFile(varsFile)
			}, {
				url: mixinsFile,
				crc: 'abc',
				content: readFile(mixinsFile)
			}]
		};

		var lessTree1 = tree.build(readFile(lessFile1));
		var lessTree2 = tree.build(readFile(lessFile2));
		var props, expectedProps;

		// check deps variables
		var props = lessCtx.properties(lessTree1.get('.jumbotron'), options).map(function(p) {
			return p.name + ': ' + p.value;
		});

		assert.deepEqual(props, ['padding: 30px', 'margin-bottom: 30px', 'font-size: 21px', 'font-weight: 200', 'line-height: 2.1428571435', 'color: inherit', 'background-color: #eeeeee']);

		var selectors = _.pluck(locator.toList(lessTree1, options), 'pathString');
		var expectedSelectors = [
			'.jumbotron',
			'.jumbotron h1, .jumbotron .h1',
			'.jumbotron p',
			'.container .jumbotron',
			'.jumbotron .container',
			'@media screen and (min-width: 768px)/.jumbotron',
			'@media screen and (min-width: 768px)/.container .jumbotron',
			'@media screen and (min-width: 768px)/.jumbotron h1, .jumbotron .h1'
		];

		// assert.deepEqual(selectors, expectedSelectors);

		// check deps mixins
		props = lessCtx.properties(lessTree2.get('.modal').get('&.fade .modal-dialog'), options).map(function(p) {
			return p.name + ': ' + p.value;
		});

		assert.deepEqual(props, [
			'-webkit-transform: translate(0, -25%)',
			'-ms-transform: translate(0, -25%)',
			'transform: translate(0, -25%)',
			'-webkit-transition: -webkit-transform 0.3s ease-out',
			'-moz-transition: -moz-transform 0.3s ease-out',
			'-o-transition: -o-transform 0.3s ease-out',
			'transition: transform 0.3s ease-out'
		]);
	});

	it('should patch LESS source', function() {
		var lessFile = readFile('bootstrap/jumbotron.less');
		var varsFile = p('bootstrap/variables.less');
		var mixinsFile = p('bootstrap/mixins.less');

		var options = {
			syntax: 'less',
			deps: [{
				url: varsFile,
				crc: 'abc',
				content: readFile(varsFile)
			}, {
				url: mixinsFile,
				crc: 'abc',
				content: readFile(mixinsFile)
			}]
		};

		var lessFile1 = lessFile.replace(/@jumbotron-padding;/g, '@jumbotron-padding + 1;');
		var lessFile2 = lessFile.replace(/@jumbotron-padding;/g, '40px;');
		var tree1 = tree.build(lessFile1);
		var tree2 = tree.build(lessFile2);
		var d = diff.diff(tree1, tree2, options);

		// must apply safe patching
		var result = patch.patch(lessFile1, d, options);
		assert(~result.indexOf('@jumbotron-padding + 10px'));
	});

	it('should safe patch value', function() {
		var lessFile = '@v:10px;a{b:@v;}';
		var d = diff.diff('a{b:10px;}', 'a{b:11px;}');
		var options = {syntax: 'less'};
		var p = function(val) {
			if (val) {
				d[0].properties[0].value = val;
			}
			lessFile = patch.patch(lessFile, d, options);
			// console.log(lessFile);
			return lessFile;
		};

		// working with numbers
		assert.equal(p(),       '@v:10px;a{b:@v + 1px;}');
		assert.equal(p('12px'), '@v:10px;a{b:@v + 2px;}');
		assert.equal(p('20px'), '@v:10px;a{b:@v + 10px;}');
		assert.equal(p('5px'),  '@v:10px;a{b:@v - 5px;}');
		assert.equal(p('10px'), '@v:10px;a{b:@v;}');

		// working with colors
		lessFile = '@c:#aaa;a{b:@c;}';
		d = diff.diff('a{b:#aaa;}', 'a{b:#bbb;}');
		assert.equal(p(),       '@c:#aaa;a{b:@c + #111111;}');
		assert.equal(p('#ccc'), '@c:#aaa;a{b:@c + #222222;}');
		assert.equal(p('#ddd'), '@c:#aaa;a{b:@c + #333333;}');
		assert.equal(p('#999'), '@c:#aaa;a{b:@c - #111111;}');
		assert.equal(p('#aaa'), '@c:#aaa;a{b:@c;}');
	});

	it('should parse guards', function() {
		var g = function(name) {
			var guardsDef = lessCtx.extractMixinGuard(name);
			if (!guardsDef.guards) {
				return name;
			}

			return guardsDef.name + ' ' + guardsDef.guards.map(function(g) {
				return '[' + g.map(function(item) {
					return (item.negate ? '!' : '') + '(' + item.source + ')';
				}).join(', ') + ']';
			}).join(', ');
		};

		assert.equal(g('.a when (a > 0)'), '.a [(a > 0)]');
		assert.equal(g('.a when (a > 0), (b = 1)'), '.a [(a > 0)], [(b = 1)]');
		assert.equal(g('.a when (a > 0) and (c > 3), (b = 1)'), '.a [(a > 0), (c > 3)], [(b = 1)]');
		assert.equal(g('.a when not (a > 0) and not (c > 3), (b = 1)'), '.a [!(a > 0), !(c > 3)], [(b = 1)]');
	});
});