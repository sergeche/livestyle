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

describe('SCSS', function() {
	var scss1 = 'table { th {font-weight: bold;} td {font-size: 12px;} }';
	var scss2 = 'table { th {font-weight: bold;} td {font-size: 20px;} }';

	var scss3 = '.section{ a{color:red; &:hover{color:blue;}} }';
	var scss4 = '.section{ a{color:red; &:hover{color:green;}} }';

	var css1 = 'table td {font-size: 12px;}';
	var css2 = 'table td {padding: 10px}';

	var css3 = '.section a{color:red} .section a:hover{color:blue}';
	var css4 = '.section a{color:red} .section a:hover{color:green}';

	it('should locate nested section', function() {
		var cssTree = tree.build(scss1);

		// var d1 = diff.diff(css1, css2);
		// var d2 = diff.diff(scss1, scss2, {syntax: 'scss'});
		// var d3 = diff.diff(scss3, scss4, {syntax: 'scss'});
		var d4 = diff.diff(css3, css4);
		// console.log(d2[0].path);
		// console.log(d3[0].path);
		// console.log(d4);
		// console.log(patch.patch(scss1, d1, {syntax: 'scss'}));
		// console.log(patch.patch(css1, d2));
		// console.log(patch.patch(scss3, d4, {syntax: 'scss'}));
	});
});