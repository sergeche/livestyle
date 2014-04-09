var fs = require('fs');
var path = require('path');

var lessResolver = require('../../../lib/preprocessor/less/resolver');


describe('LESS debug', function() {
	function p(dir) {
		return path.join(__dirname, dir);
	}

	it('should transform file', function() {
		var less = fs.readFileSync(p('debug.less'), {encoding: 'utf8'});
		var css = lessResolver.resolve(less);
		console.log(css.toCSS());
	});
})