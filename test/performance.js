var fs = require('fs');
var rjs = require('requirejs');
var path = require('path');
var assert = require('assert');

rjs.config({
	baseUrl: path.resolve(__dirname, '../lib'),
	paths: {
		lodash: 'vendor/lodash'
	}
});

var sourcer = rjs('sourcer');

function readCSS(cssPath) {
	return fs.readFileSync(path.join(__dirname, cssPath), 'utf8');
}

describe('Performance', function() {
	var style1 = readCSS('css/inn-blocks.css');
	it('should be fast :)', function() {

		sourcer.applyPatch(style1, {
			"path": [[".bmainpagefeatures__eitem",1]],
			"properties":[{
				"name": "font-size",
				"value": "21px",
				"index": 2
			}],
			"removed": null
		});

		assert(true);
	});
});