var rjs = require('requirejs');
var assert = require('assert');
var path = require('path');

rjs.config({
	baseUrl: path.resolve(__dirname, '../lib'),
	paths: {
		lodash: 'vendor/lodash'
	}
});

var sourcer = rjs('sourcer');

/**
 * Locates node by given path in CSS source and 
 * applies transformation to it
 * @param  {String} content  CSS content
 * @param  {Array}  path     CSS location path
 * @param  {String} value    New value of CSS property
 * @return {String}
 */
function patch(content, path, value) {
	if (typeof value == 'string') {
		var parts = value.split(':');
		value = {
			name: parts.shift().trim(),
			value: parts.join(':').trim()
		};
	}

	content = sourcer.applyPatch(content, {
		path: path,
		properties: value instanceof Array ? value : [value],
		removed: []
	});

	// console.log(content);
	return content;
}

describe('Sourcer', function() {
	it('should strictly match and update CSS property', function() {
		assert.equal(patch('a{b:1;}', 'a', 'b:2'), 'a{b:2;}');
		assert.equal(patch('c{b:1;} a{b:1;}', 'a', 'b:2'), 'c{b:1;} a{b:2;}');
		assert.equal(patch('c{b:1;} a{d:1;b:1;}', 'a', 'b:2'), 'c{b:1;} a{d:1;b:2;}');
		assert.equal(patch('a{b:abc}', 'a', 'b:3'), 'a{b:3}');
		assert.equal(patch('c{a{b:1}}', 'c/a', 'b:2'), 'c{a{b:2}}');
	});

	it('should find best match and update CSS property', function() {
		assert.equal(patch('a{b:1;}', 'a|2', 'b:2'), 'a{b:2;}');
		assert.equal(patch('a{b:3;b:1;}', 'a', {name: 'b', value: '2', index: 2}), 'a{b:3;b:2;}');
	});

	it('should create new sections with CSS property', function() {
		assert.equal(patch('a{b:1;}', 'c', 'd:2'), 'a{b:1;}\nc{d:2;}');
		assert.equal(patch('a {b:1;}', 'c/d', 'e:2'), 'a {b:1;}\nc {d {e:2;}}');
	});

	it('should learn coding style', function() {
		assert.equal(patch('a {\n\tb:1;\n}', 'c', 'd:2'), 'a {\n\tb:1;\n}\nc {\n\td:2;\n}');
		assert.equal(patch('a\n{\n\tb: 1;\n\t}', 'c', 'd:2'), 'a\n{\n\tb: 1;\n\t}\nc\n{\n\td: 2;\n\t}');
		assert.equal(patch('a{\n\tb: 1;\n\t}', 'a', 'd:2'), 'a{\n\tb: 1;\n\td: 2;\n\t}');
		assert.equal(patch('a{\n\tb: 1;\n}', 'a', 'd:2'), 'a{\n\tb: 1;\n\td: 2;\n}');
		assert.equal(patch('a{b: 1}', 'a', 'd:2'), 'a{b: 1;d: 2;}');
		assert.equal(patch('', 'a/b', 'c:1'), 'a {\n\tb {\n\t\tc: 1;\n\t}\n}');
	});

	it('should patch source', function() {
		var style1 = 'b{padding:10px}';
		var style2 = 'b{margin:10px;padding:5px;}';

		var patch = function(pos) {
			var p = sourcer.makePatch(style2, pos);
			var src = sourcer.applyPatch(style1, p);
			// console.log(src);
			return src;
		};

		assert.equal(patch(18), 'b{padding:5px}');
		assert.equal(patch(7),  'b{padding:10px;margin:10px;}');
		assert.equal(patch(26), 'b{padding:5px;margin:10px;}');
		assert.equal(patch(14), 'b{padding:5px;margin:10px;}');
	});

	it('should compare CSS sections', function() {
		var diff = sourcer.compareSections(
			'b{padding:10px;color:#fff;}', 
			'b{margin:10px;padding:10px;}');

		assert.deepEqual(diff, {
			added: [{name: 'margin', value: '10px'}],
			updated: [],
			removed: [{name: 'color', value: '#fff', index: 1}]
		});

		diff = sourcer.compareSections(
			'b{padding:10px;color:#fff;}', 
			'b{}');
		
		assert.deepEqual(diff, {
			added: [],
			updated: [],
			removed: [{name: 'padding', value: '10px', index: 0}, {name: 'color', value: '#fff', index: 1}]
		});

		diff = sourcer.compareSections(
			'b{}',
			'b{padding:10px;color:#fff;}');
		
		assert.deepEqual(diff, {
			added: [{name: 'padding', value: '10px'}, {name: 'color', value: '#fff'}],
			updated: [],
			removed: [] 
		});

		diff = sourcer.compareSections(
			'b{padding:10px;color:#000;}',
			'b{padding:10px;color:#fff;}');
		
		assert.deepEqual(diff, {
			added: [],
			updated: [{name: 'color', value: '#fff'}],
			removed: [] 
		});
	});

	it('should condense patches', function() {
		var parse = function(props) {
			if (!props) return [];
			if (typeof props != 'string') return props;

			return props.split(';').map(function(item) {
				var parts = item.split(':');
				return {
					name: parts[0].trim(),
					value: parts[1].trim()
				};
			});
		}

		var p = function(properties, removed, path) {
			return {
				path: path || 'div',
				properties: parse(properties),
				removed: parse(removed)
			};
		};

		var cond = function() {
			var args = Array.prototype.slice.call(arguments, 0);
			var out = sourcer.condensePatches([origPatch].concat(args));
			// console.log('cond', JSON.stringify(out));
			return out;
		};

		var origPatch = p('padding:10px;color:red', 'margin:1px');

		assert.deepEqual(
			cond( p('position:relative') ),
			[p('padding:10px;color:red;position:relative', 'margin:1px')]
		);

		assert.deepEqual(
			cond( p('position:relative;padding:5px') ),
			[p('padding:5px;color:red;position:relative', 'margin:1px')]
		);

		assert.deepEqual(
			cond( p('', 'color:red') ),
			[p('padding:10px;color:red', 'margin:1px;color:red')]
		);
		
		assert.deepEqual(
			cond( p('font-size:10px'), p('margin:1px') ),
			[p('padding:10px;color:red;font-size:10px;margin:1px')]
		);


	});
});