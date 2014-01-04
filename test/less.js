var fs = require('fs');
var path = require('path');
var assert = require('assert');
var tree = require('../lib/tree');
var diff = require('../lib/diff');
var patch = require('../lib/patch');
var locator = require('../lib/locator');

function readCSS(cssPath) {
	return fs.readFileSync(path.join(__dirname, cssPath), 'utf8');
}

describe('LESS', function() {
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
		var less1 = '@v:12px; @c:#fc0; a {b: @v; c: @c; d: @v; e: 10px;}';
		var css1 = 'a {b: 14px; c: #fa0; d: 3em; e: 12px;}';

		var d = diff.diff(less1, css1, {syntax: 'less'});

		var patchedSource = patch.patch(less1, d, {syntax: 'less'});
		assert.equal(patchedSource, '@v:12px; @c:#fc0; a {b: @v + 2px; c: @c - #002200; d: 3em; e: 12px;}');
	});

	it.only('should patch basic LESS expressions', function() {
		var less1 = '@v:12px; @c:#fc0; a {b: @v + 2 / 1; /* c: lighten(#fc0, 10%); d: lighten(@c, 10%); */}';
		var css1 = 'a {b: 16px; /* c: #ffe066; d: #ffe066; */}';

		var d = diff.diff(less1, css1, {syntax: 'less'});

		var patchedSource = patch.patch(less1, d, {syntax: 'less'});
		console.log(patchedSource);
		// assert.equal(patchedSource, '@v:12px; @c:#fc0; a {b: @v + 2px; c: @c - #002200; d: 3em;}');
	});
});