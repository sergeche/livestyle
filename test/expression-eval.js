var assert = require('assert');
var expr = require('../lib/vendor/expression-eval.js');

describe('Expression evaluator', function() {
	var e = function(expression, vars) {
		return expr.evaluate(expression, vars);
	};

	it('should eval simple expression', function() {
		assert.equal(e('1'), 1);
		assert.equal(e('1 + 2 * 4'), 9);
		assert.equal(e('1em'), '1em');
		assert.equal(e('1em + 2'), '3em');
		assert.equal(e('1em + 2px'), '3em');
		assert.equal(e('100% / 4'), '25%');
	});

	it('should operate with colors', function() {
		assert.equal(e('#fff'), '#ffffff');
		assert.equal(e('#555 + 2'), '#575757');
		assert.equal(e('#fff + 2'), '#ffffff');
		assert.equal(e('#111 + #222'), '#333333');
		assert.equal(e('3 * #111'), '#333333');
	});

	it('should use variables', function() {
		assert.equal(e('1 + @a * @b', {
			'@a': 2,
			'@b': 4
		}), 9);

		assert.equal(e('1 + $a * $b', {
			'$a': 2,
			'$b': 4
		}), 9);

		assert.equal(e('3 + @border-color', {
			'@border-color': '#111'
		}), '#141414');
	});

	it('should work with custom functions', function() {
		// will use a real-life LESS function to test
		var toHSL = function (color) {
			var r = ((color & 0xff0000) >> 16) / 255,
    			g = ((color & 0x00ff00) >> 8) / 255, 
    			b = (color & 0x0000ff) / 255,
				a = 1;

			var max = Math.max(r, g, b), min = Math.min(r, g, b);
			var h, s, l = (max + min) / 2, d = max - min;

			if (max === min) {
				h = s = 0;
			} else {
				s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

				switch (max) {
					case r: h = (g - b) / d + (g < b ? 6 : 0); break;
					case g: h = (b - r) / d + 2;               break;
					case b: h = (r - g) / d + 4;               break;
				}
				h /= 6;
			}
			return { h: h * 360, s: s, l: l, a: a };
		};

		var clamp = function(val) {
			return Math.min(1, Math.max(0, val));
		};

		var hsla = function (h, s, l, a) {
			function hue(h) {
				h = h < 0 ? h + 1 : (h > 1 ? h - 1 : h);
				if      (h * 6 < 1) { return m1 + (m2 - m1) * h * 6; }
				else if (h * 2 < 1) { return m2; }
				else if (h * 3 < 2) { return m1 + (m2 - m1) * (2/3 - h) * 6; }
				else                { return m1; }
			}

			h = (h % 360) / 360;
			s = clamp(s); l = clamp(l); a = clamp(a);

			var m2 = l <= 0.5 ? l * (s + 1) : l + s - l * s;
			var m1 = l * 2 - m2;

			return rgb(hue(h + 1/3) * 255,
				hue(h)       * 255,
				hue(h - 1/3) * 255);
		};

		var rn = Math.round;

		var rgb = function (r, g, b) {
			var color = ((rn(r) << 16) + (rn(g) << 8) + rn(b)).toString(16);
			while (color.length < 6) {
				color = '0' + color;
			}

			return '#' + color;
		};

		assert.equal(e('1 + a(b(2))', {
			a: function(num) {
				return num + 2;
			},
			b: function(num) {
				return num * 3;
			}
		}), 9);

		assert.equal(e('#111 + lighten(#333, 10%)', {
			lighten: function (color, amount) {
				color = expr.evalArg(color);
				amount = expr.evalArg(amount);
				var hsl = toHSL(color.value);

				hsl.l = clamp(hsl.l + amount.value / 100);
				return hsla(hsl.h, hsl.s, hsl.l, hsl.a);
			}
		}), '#5e5e5e');
	});
});