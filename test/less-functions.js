var _ = require('lodash');
var assert = require('assert');
var expr = require('../lib/expression.js');
var lessFunctions = require('../lib/less/functions');

describe('LESS functions:', function() {
	var e = function(expression, vars) {
		vars = _.extend(vars || {}, lessFunctions);
		return expr.eval(expression, vars);
	};

	it('strings', function() {
		assert.equal(e('e("-Some::weird(#thing, y)")'), '-Some::weird(#thing, y)');
		assert.equal(e('escape("hello- world")'), 'hello-%20world');
		assert.equal(e('%("rgb(%d, %d, %d)", @r, 128, 64)', {'@r': 200}), '"rgb(200, 128, 64)"');
	});

	it('conversion', function() {
		assert.equal(e('unit((13px + 1px), em)'), '14em');
		assert.equal(e('unit(12px)'), '12');
		assert.equal(e('color("#ff0011")'), '#ff0011');
		assert.equal(e('color("red")'), '#ff0000');
		assert.equal(e('convert(acos(cos(34deg)), deg)'), '34deg');
		assert.equal(e('convert(acos(cos(50grad)), deg)'), '45deg');

		// TODO data-uri?
	});

	it('math', function() {
		assert.equal(e('ceil(12.4%)'), '13%');
		assert.equal(e('floor(12.4%)'), '12%');
		assert.equal(e('percentage(0.4)'), '40%');
		assert.equal(e('round(12.4%, 2)'), '12.40%');
		assert.equal(e('round(12.4%)'), '12%');
		assert.equal(e('sqrt(4em)'), '2em');
		assert.equal(e('abs(-4em)'), '4em');
		assert.equal(e('sin(90deg)'), '1');
		assert.equal(e('sin(1.570796327)'), '1');
		assert.equal(e('pi()'), Math.PI);
		assert.equal(e('pow(2em, 3)'), '8em');
		assert.equal(e('pow(2, 3em)'), '8em');
		assert.equal(e('mod(5, 2px)'), '1px');
		assert.equal(e('mod(5px, 2)'), '1px');
	});

	it('colors', function() {
		assert.equal(e('rgb(1, 2, 3)'), '#010203');
		assert.equal(e('rgba(1, 2, 3, .4)'), 'rgba(1, 2, 3, 0.4)');
		assert.equal(e('argb(#fff)'), '#ffffffff');
		assert.equal(e('argb(rgba(1, 2, 3, .4))'), '#66010203');
		assert.equal(e('hsl(380, 150%, 150%)'), '#ffffff');
		assert.equal(e('hsla(25, 50%, 50%, 0.6)'), 'rgba(191, 117, 64, 0.6)');
		assert.equal(e('hsv(5, 50%, 30%)'), '#4d2926');
		assert.equal(e('hsva(3, 50%, 30%, 0.2)'), 'rgba(77, 40, 38, 0.2)');
	});

	it('color components', function() {
		assert.equal(e('hue(hsl(98, 12%, 95%))'), '98');
		assert.equal(e('saturation(hsl(98, 12%, 95%))'), '12%');
		assert.equal(e('lightness(hsl(98, 12%, 95%))'), '95%');
		assert.equal(e('hsvhue(hsv(98, 12%, 95%))'), '98');
		assert.equal(e('hsvsaturation(hsv(98, 12%, 95%))'), '12%');
		assert.equal(e('hsvvalue(hsv(98, 12%, 95%))'), '95%');
		assert.equal(e('red(#f00)'), '255');
		assert.equal(e('green(#0f0)'), '255');
		assert.equal(e('blue(#00f)'), '255');

		assert.equal(e('alpha(rgba(3, 4, 5, 0.5))'), '0.5');
		assert.equal(e('alpha(transparent)'), '0');

		assert.equal(e('luma(#fff)'), '100%');
		assert.equal(e('luma(#000)'), '0%');
		assert.equal(e('luma(rgba(0,0,0,0.5))'), '0%');
		assert.equal(e('luma(#ff0000)'), '21%');
		assert.equal(e('luma(#00ff00)'), '72%');
		assert.equal(e('luma(#0000ff)'), '7%');
		assert.equal(e('luma(#ffff00)'), '93%');
		assert.equal(e('luma(#00ffff)'), '79%');
		assert.equal(e('luma(rgba(255,255,255,0.5))'), '50%');
	});
});