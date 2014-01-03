var fs = require('fs');
var path = require('path');
var assert = require('assert');
var lessCtx = require('../lib/less/context');
var treeBuilder = require('../lib/tree');
var locator = require('../lib/locator');
var cssParser = require('emmet/lib/parser/css');

function readFile(filePath) {
	return fs.readFileSync(path.join(__dirname, filePath), 'utf8');
}

describe('LESS evaluator', function() {
	var input = readFile('less/input.less');
	var output = readFile('less/output.css');

	it('should evaluate expression in tree context', function() {
		var inTree = treeBuilder.build(input);
		var outTree = treeBuilder.build(output);

		inTree.children.forEach(function(item) {
			if (item.type == 'section') {
				var sectionName = item.name();
				item.properties().forEach(function(prop) {
					if (prop.name.charAt(0) == '@') return;

					var prefix = sectionName + '/' + prop.name + ': ';
					var expectedValue = outTree.get(sectionName).get(prop.name).value();

					var val = lessCtx.eval(prop.node);
					assert.equal(prefix + val, prefix + expectedValue);
				});
			}
		});
	});
});