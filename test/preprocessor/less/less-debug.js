var fs = require('fs');
var path = require('path');

var lessResolver = require('../../../lib/preprocessor/less/resolver');

function resolveLESS(tree) {
	return lessResolver.resolve(tree).sectionList().filter(function(item) {
		// check if current node contains empty sections
		for (var i = 0, il = item.node.children.length, c; i < il; i++) {
			c = item.node.children[i];
			if (c.type == 'property' || c.children.length) {
				return true;
			}
		}

		return false;
	});
}

describe('LESS debug', function() {
	function p(dir) {
		return path.join(__dirname, dir);
	}

	it('should transform file', function() {
		var less = fs.readFileSync(p('debug.less'), {encoding: 'utf8'});
		var css = lessResolver.resolve(less);
		console.log(css.toCSS(true));
		// console.log(resolveLESS(less).map(function(item) {
		// 	return item.name;
		// }).join('\n'));
	});
})