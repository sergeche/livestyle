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
	var less1 = 'table { th {font-weight: bold;} td {font-size: 12px;} }';
	var less2 = 'table { th {font-weight: bold;} td {font-size: 12px + 8;} }';

	var less3 = '.section{ a{color:red; &:hover{color:blue;}} }';
	var less4 = '.section{ a{color:red; &:hover{color:green;}} }';

	var css1 = 'table td {font-size: 12px;}';
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

	it('should apply CSS patch to LESS source', function() {
		var d = diff.diff(css1, css2);
	});
});