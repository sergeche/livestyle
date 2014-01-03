/**
 * Functions implementations used in LESS expressions.
 * It’s a slightly modified version of original LESS implementation:
 * https://github.com/less/less.js/blob/master/lib/less/functions.js
 * 
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var exprEvaluator = require('../vendor/expression-eval.js');
	var colors = require('../color.js');

	var defaultUnits = {
		length: 'm',
		duration: 's',
		angle: 'rad'
	};

	var unitConversions = {
		// length
		length: {
			'm': 1,
			'cm': 0.01,
			'mm': 0.001,
			'in': 0.0254,
			'pt': 0.0254 / 72,
			'pc': 0.0254 / 72 * 12
		},

		// duration
		duration: {
			's': 1,
			'ms': 0.001
		},
		
		// angle
		angle: {
			'rad': 1/(2*Math.PI),
			'deg': 1/360,
			'grad': 1/400,
			'turn': 1
		}
	};

	function clamp(val) {
		return Math.min(1, Math.max(0, val));
	}

	/**
	 * Returns color value from expression argument
	 * @param  {Argument} val
	 * @return {Object}
	 */
	function color(val) {
		return colors.parse(val.color() || val.value);
	}

	function dimention(value, unit) {
		var strValue = String(value);

		if (value !== 0 && value < 0.000001 && value > -0.000001) {
			// would be output 1e-6 etc.
			strValue = value.toFixed(20).replace(/0+$/, "");
		}

		return strValue + (unit || '');
    }

    function unitCoeff(unit) {
    	for (var p in unitConversions) if (unitConversions.hasOwnProperty(p)) {
    		if (unit in unitConversions[p]) {
    			return unitConversions[p][unit];
    		}
    	}
    }

    function convertTo(value, from, to) {
		if (!from) {
			// no original unit, pick default one from group
			_.each(unitConversions, function(group, name) {
				if (to in group) {
					from = defaultUnits[name];
				}
			});
		}

		if (!from || !to) {
			return {
				value: value,
				unit: from
			};
		}

		return {
			value: value * unitCoeff(from) / unitCoeff(to),
			unit: to
		};
    }

	var mathFunctions = {
		// name,  unit
		ceil:  null, 
		floor: null, 
		sqrt:  null, 
		abs:   null,
		tan:   "", 
		sin:   "", 
		cos:   "",
		atan:  "rad", 
		asin:  "rad", 
		acos:  "rad"
	};

	function _math(fn, unit, n) {
		if (unit === null) {
			unit = n.unit;
		} else if (unit === '' || unit === 'rad') {
			// convert degrees to radians, if required
			if (n.unit !== 'rad') {
				n.value = convertTo(n.value, n.unit, 'rad').value;
			}
		}

		return dimention(fn(parseFloat(n.value)), unit);
	}

	// Color Blending
	// ref: http://www.w3.org/TR/compositing-1
	function colorBlend(mode, color1, color2) {
		var ab = color1.alpha, cb, // backdrop
			as = color2.alpha, cs, // source
			ar, cr, r = [];        // result

		ar = as + ab * (1 - as);
		for (var i = 0; i < 3; i++) {
			cb = color1.rgb[i] / 255;
			cs = color2.rgb[i] / 255;
			cr = mode(cb, cs);
			if (ar) {
				cr = (as * cs + ab * (cb - as * (cb + cs - cr))) / ar;
			}
			r[i] = cr * 255;
		}

		return new(tree.Color)(r, ar);
	}

	var colorBlendMode = {
		multiply: function(cb, cs) {
			return cb * cs;
		},
		screen: function(cb, cs) {
			return cb + cs - cb * cs;
		},   
		overlay: function(cb, cs) {
			cb *= 2;
			return (cb <= 1)
			? colorBlendMode.multiply(cb, cs)
			: colorBlendMode.screen(cb - 1, cs);
		},
		softlight: function(cb, cs) {
			var d = 1, e = cb;
			if (cs > 0.5) {
				e = 1;
				d = (cb > 0.25) ? Math.sqrt(cb)
				: ((16 * cb - 12) * cb + 4) * cb;
			}            
			return cb - (1 - 2 * cs) * e * (d - cb);
		},
		hardlight: function(cb, cs) {
			return colorBlendMode.overlay(cs, cb);
		},
		difference: function(cb, cs) {
			return Math.abs(cb - cs);
		},
		exclusion: function(cb, cs) {
			return cb + cs - 2 * cb * cs;
		},

		// non-w3c functions:
		average: function(cb, cs) {
			return (cb + cs) / 2;
		},
		negation: function(cb, cs) {
			return 1 - Math.abs(cb + cs - 1);
		}
	};

	function hsla(color) {
		return module.exports.hsla(color.h, color.s, color.l, color.a);
	}

	function scaled(n, size) {
		if (typeof n == 'object' && n.unit == '%') {
			return parseFloat(n.value * size / 100);
		} else {
			return number(n);
		}
	}

	function number(n) {
		if (typeof n == 'object') {
			return parseFloat(n.unit == '%' ? n.value / 100 : n.value);
		} else if (typeof(n) === 'number') {
			return n;
		} else {
			throw {
				error: "RuntimeError",
				message: "color functions take numbers as parameters"
			};
		}
	}

	module.exports = {
		rgb: function (r, g, b) {
			return this.rgba(r, g, b, 1);
		},
		rgba: function (r, g, b, a) {
			var rgb = [r, g, b].map(function (c) { return scaled(c, 255); });
			a = number(a);
			return exprEvaluator.colorToken(colors.parse(rgb, a));
		},
		hsl: function (h, s, l) {
			return this.hsla(h, s, l, 1);
		},
		hsla: function (h, s, l, a) {
			function hue(h) {
				h = h < 0 ? h + 1 : (h > 1 ? h - 1 : h);
				if      (h * 6 < 1) { return m1 + (m2 - m1) * h * 6; }
				else if (h * 2 < 1) { return m2; }
				else if (h * 3 < 2) { return m1 + (m2 - m1) * (2/3 - h) * 6; }
				else                { return m1; }
			}

			h = (number(h) % 360) / 360;
			s = clamp(number(s));
			l = clamp(number(l));
			a = clamp(number(a));

			var m2 = l <= 0.5 ? l * (s + 1) : l + s - l * s;
			var m1 = l * 2 - m2;

			return this.rgba(hue(h + 1/3) * 255,
				hue(h)       * 255,
				hue(h - 1/3) * 255,
				a);
		},

		hsv: function(h, s, v) {
			return this.hsva(h, s, v, 1.0);
		},

		hsva: function(h, s, v, a) {
			h = ((number(h) % 360) / 360) * 360;
			s = number(s); v = number(v); a = number(a);

			var i, f;
			i = Math.floor((h / 60) % 6);
			f = (h / 60) - i;

			var vs = [v,
				v * (1 - s),
				v * (1 - f * s),
				v * (1 - (1 - f) * s)];
			var perm = [[0, 3, 1],
				[2, 0, 1],
				[1, 0, 3],
				[1, 2, 0],
				[3, 1, 0],
				[0, 1, 2]];

			return this.rgba(vs[perm[i][0]] * 255,
				vs[perm[i][1]] * 255,
				vs[perm[i][2]] * 255,
				a);
		},

		hue: function (arg) {
			var hsl = colors.toHSL(color(arg));
			return dimention(Math.round(hsl.h));
		},
		saturation: function (arg) {
			var hsl = colors.toHSL(color(arg));
			return dimention(Math.round(hsl.s * 100), '%');
		},
		lightness: function (arg) {
			var hsl = colors.toHSL(color(arg));
			return dimention(Math.round(hsl.l * 100), '%');
		},
		hsvhue: function(arg) {
			var hsv = colors.toHSV(color(arg));
			return dimention(Math.round(hsv.h));
		},
		hsvsaturation: function (arg) {
			var hsv = colors.toHSV(color(arg));
			return dimention(Math.round(hsv.s * 100), '%');
		},
		hsvvalue: function (arg) {
			var hsv = colors.toHSV(color(arg));
			return dimention(Math.round(hsv.v * 100), '%');
		},
		red: function (arg) {
			var rgb = colors.parse(color(arg));
			return dimention(Math.round(rgb.r));
		},
		green: function (arg) {
			var rgb = colors.parse(color(arg));
			return dimention(Math.round(rgb.g));
		},
		blue: function (arg) {
			var rgb = colors.parse(color(arg));
			return dimention(Math.round(rgb.b));
		},
		alpha: function (arg) {
			var hsl = colors.toHSL(color(arg));
			return dimention(hsl.a);
		},
		luma: function (arg) {
			arg = color(arg);
			var luma = colors.luma(arg);
			return dimention(Math.round(luma * colors.parse(arg).a * 100), '%');
		},
		saturate: function (c, amount) {
			c = colors.parse(color(c));
			// filter: saturate(3.2);
			// should be kept as is, so check for color
			if (!c) {
				return null;
			}

			var hsl = colors.toHSL(c);

			hsl.s += amount.value / 100;
			hsl.s = clamp(hsl.s);
			return hsla(hsl);
		},
		desaturate: function (color, amount) {
			var hsl = color.toHSL();

			hsl.s -= amount.value / 100;
			hsl.s = clamp(hsl.s);
			return hsla(hsl);
		},
		lighten: function (color, amount) {
			var hsl = color.toHSL();

			hsl.l += amount.value / 100;
			hsl.l = clamp(hsl.l);
			return hsla(hsl);
		},
		darken: function (color, amount) {
			var hsl = color.toHSL();

			hsl.l -= amount.value / 100;
			hsl.l = clamp(hsl.l);
			return hsla(hsl);
		},
		fadein: function (color, amount) {
			var hsl = color.toHSL();

			hsl.a += amount.value / 100;
			hsl.a = clamp(hsl.a);
			return hsla(hsl);
		},
		fadeout: function (color, amount) {
			var hsl = color.toHSL();

			hsl.a -= amount.value / 100;
			hsl.a = clamp(hsl.a);
			return hsla(hsl);
		},
		fade: function (color, amount) {
			var hsl = color.toHSL();

			hsl.a = amount.value / 100;
			hsl.a = clamp(hsl.a);
			return hsla(hsl);
		},
		spin: function (color, amount) {
			var hsl = color.toHSL();
			var hue = (hsl.h + amount.value) % 360;

			hsl.h = hue < 0 ? 360 + hue : hue;

			return hsla(hsl);
		},
		//
		// Copyright (c) 2006-2009 Hampton Catlin, Nathan Weizenbaum, and Chris Eppstein
		// http://sass-lang.com
		//
		mix: function (color1, color2, weight) {
			if (!weight) {
				weight = new(tree.Dimension)(50);
			}
			var p = weight.value / 100.0;
			var w = p * 2 - 1;
			var a = color1.toHSL().a - color2.toHSL().a;

			var w1 = (((w * a == -1) ? w : (w + a) / (1 + w * a)) + 1) / 2.0;
			var w2 = 1 - w1;

			var rgb = [color1.rgb[0] * w1 + color2.rgb[0] * w2,
			color1.rgb[1] * w1 + color2.rgb[1] * w2,
			color1.rgb[2] * w1 + color2.rgb[2] * w2];

			var alpha = color1.alpha * p + color2.alpha * (1 - p);

			return new(tree.Color)(rgb, alpha);
		},
		greyscale: function (color) {
			return this.desaturate(color, new(tree.Dimension)(100));
		},
		contrast: function (color, dark, light, threshold) {
			// filter: contrast(3.2);
			// should be kept as is, so check for color
			if (!color.rgb) {
				return null;
			}
			if (typeof light === 'undefined') {
				light = this.rgba(255, 255, 255, 1.0);
			}
			if (typeof dark === 'undefined') {
				dark = this.rgba(0, 0, 0, 1.0);
			}
			//Figure out which is actually light and dark!
			if (dark.luma() > light.luma()) {
				var t = light;
				light = dark;
				dark = t;
			}
			if (typeof threshold === 'undefined') {
				threshold = 0.43;
			} else {
				threshold = number(threshold);
			}
			if (color.luma() < threshold) {
				return light;
			} else {
				return dark;
			}
		},
		e: function (str) {
			return str.value;
		},
		escape: function (str) {
			return encodeURI(str.value).replace(/=/g, "%3D").replace(/:/g, "%3A").replace(/#/g, "%23").replace(/;/g, "%3B").replace(/\(/g, "%28").replace(/\)/g, "%29");
		},
		'%': function (quoted /* arg, arg, ...*/) {
			var args = Array.prototype.slice.call(arguments, 1),
			str = quoted.value;

			for (var i = 0; i < args.length; i++) {
				/*jshint loopfunc:true */
				str = str.replace(/%[sda]/i, function(token) {
					// var value = token.match(/s/i) ? args[i].value : args[i].toCSS();
					var value = args[i].value;
					return token.match(/[A-Z]$/) ? encodeURIComponent(value) : value;
				});
			}
			str = str.replace(/%%/g, '%');
			return '"' + str + '"';
		},
		unit: function (val, unit) {
			return dimention(val.value, unit ? unit.value : '');
		},
		convert: function (val, unit) {
			var result = convertTo(val.value, val.unit, unit.value);
			return dimention(result.value, result.unit);
		},
		round: function (n, f) {
			var fraction = typeof(f) === "undefined" ? 0 : f.value;
			return _math(function(num) { return num.toFixed(fraction); }, null, n);
		},
		pi: function () {
			return Math.PI;
		},
		mod: function(a, b) {
			return dimention(a.value % b.value, a.unit || b.unit);
		},
		pow: function(x, y) {
			return dimention(Math.pow(x.value, y.value), x.unit || y.unit);
		},
		_minmax: function (isMin, args) {
			args = Array.prototype.slice.call(args);
			switch(args.length) {
				case 0: throw { type: "Argument", message: "one or more arguments required" };
				case 1: return args[0];
			}
			var i, j, current, currentUnified, referenceUnified, unit,
				order  = [], // elems only contains original argument values.
				values = {}; // key is the unit.toString() for unified tree.Dimension values,
				// value is the index into the order array.
			
			for (i = 0; i < args.length; i++) {
				current = args[i];
				if (!(current instanceof tree.Dimension)) {
					order.push(current);
					continue;
				}
				currentUnified = current.unify();
				unit = currentUnified.unit.toString();
				j = values[unit];
				if (j === undefined) {
					values[unit] = order.length;
					order.push(current);
					continue;
				}
				referenceUnified = order[j].unify();
				if ( isMin && currentUnified.value < referenceUnified.value ||
					!isMin && currentUnified.value > referenceUnified.value) {
					order[j] = current;
				}
			}
			if (order.length == 1) {
				return order[0];
			}
			args = order.map(function (a) { return a.toCSS(this.env); })
				.join(this.env.compress ? "," : ", ");
			return new(tree.Anonymous)((isMin ? "min" : "max") + "(" + args + ")");
		},
		min: function () {
			return this._minmax(true, arguments);
		},
		max: function () {
			return this._minmax(false, arguments);
		},
		argb: function (arg) {
			return colors.toARGB(color(arg));
		},
		percentage: function (n) {
			return dimention(n.value * 100, '%');
		},
		color: function (n) {
			if (n.type == 'string') {
				var colorCandidate = n.value,
				returnColor;
				returnColor = colors.fromKeyword(colorCandidate);
				if (returnColor) {
					return returnColor;
				}
				if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/.test(colorCandidate)) {
					return colorCandidate;
				}
				throw { type: "Argument", message: "argument must be a color keyword or 3/6 digit hex e.g. #FFF" };
			} else {
				throw { type: "Argument", message: "argument must be a string" };
			}
		},
		iscolor: function (n) {
			return this._isa(n, tree.Color);
		},
		isnumber: function (n) {
			return this._isa(n, tree.Dimension);
		},
		isstring: function (n) {
			return this._isa(n, tree.Quoted);
		},
		iskeyword: function (n) {
			return this._isa(n, tree.Keyword);
		},
		isurl: function (n) {
			return this._isa(n, tree.URL);
		},
		ispixel: function (n) {
			return this.isunit(n, 'px');
		},
		ispercentage: function (n) {
			return this.isunit(n, '%');
		},
		isem: function (n) {
			return this.isunit(n, 'em');
		},
		isunit: function (n, unit) {
			return (n instanceof tree.Dimension) && n.unit.is(unit.value || unit) ? tree.True : tree.False;
		},
		_isa: function (n, Type) {
			return (n instanceof Type) ? tree.True : tree.False;
		},
		tint: function(color, amount) {
			return this.mix(this.rgb(255,255,255), color, amount);
		},
		shade: function(color, amount) {
			return this.mix(this.rgb(0, 0, 0), color, amount);
		},
		extract: function(values, index) {
	    index = index.value - 1; // (1-based index)       
	    // handle non-array values as an array of length 1
	    // return 'undefined' if index is invalid
	    return Array.isArray(values.value) 
	    	? values.value[index] : Array(values)[index];
		},
		length: function(values) {
			var n = Array.isArray(values.value) ? values.value.length : 1;
			return new tree.Dimension(n);
		},

		"data-uri": function(mimetypeNode, filePathNode) {
			throw new Error('Not implemented');
		},

		"svg-gradient": function(direction) {
			function throwArgumentDescriptor() {
				throw { type: "Argument", message: "svg-gradient expects direction, start_color [start_position], [color position,]..., end_color [end_position]" };
			}

			if (arguments.length < 3) {
				throwArgumentDescriptor();
			}
			var stops = Array.prototype.slice.call(arguments, 1),
				gradientDirectionSvg,
				gradientType = "linear",
				rectangleDimension = 'x="0" y="0" width="1" height="1"',
				useBase64 = true,
				renderEnv = {compress: false},
				returner,
				directionValue = direction.toCSS(renderEnv),
				i, color, position, positionValue, alpha;

			switch (directionValue) {
				case "to bottom":
					gradientDirectionSvg = 'x1="0%" y1="0%" x2="0%" y2="100%"';
					break;
				case "to right":
					gradientDirectionSvg = 'x1="0%" y1="0%" x2="100%" y2="0%"';
					break;
				case "to bottom right":
					gradientDirectionSvg = 'x1="0%" y1="0%" x2="100%" y2="100%"';
					break;
				case "to top right":
					gradientDirectionSvg = 'x1="0%" y1="100%" x2="100%" y2="0%"';
					break;
				case "ellipse":
				case "ellipse at center":
					gradientType = "radial";
					gradientDirectionSvg = 'cx="50%" cy="50%" r="75%"';
					rectangleDimension = 'x="-50" y="-50" width="101" height="101"';
					break;
				default:
					throw { type: "Argument", message: "svg-gradient direction must be 'to bottom', 'to right', 'to bottom right', 'to top right' or 'ellipse at center'" };
			}

			returner = '<?xml version="1.0" ?>' +
				'<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">' +
				'<' + gradientType + 'Gradient id="gradient" gradientUnits="userSpaceOnUse" ' + gradientDirectionSvg + '>';

			for (i = 0; i < stops.length; i+= 1) {
				if (stops[i].value) {
					color = stops[i].value[0];
					position = stops[i].value[1];
				} else {
					color = stops[i];
					position = undefined;
				}

				if (!(color instanceof tree.Color) || (!((i === 0 || i+1 === stops.length) && position === undefined) && !(position instanceof tree.Dimension))) {
					throwArgumentDescriptor();
				}
				positionValue = position ? position.toCSS(renderEnv) : i === 0 ? "0%" : "100%";
				alpha = color.alpha;
				returner += '<stop offset="' + positionValue + '" stop-color="' + color.toRGB() + '"' + (alpha < 1 ? ' stop-opacity="' + alpha + '"' : '') + '/>';
			}
			returner += '</' + gradientType + 'Gradient>' +
			'<rect ' + rectangleDimension + ' fill="url(#gradient)" /></svg>';

			if (useBase64) {
		        // only works in node, needs interface to what is supported in environment
		        try {
		        	returner = new Buffer(returner).toString('base64');
		        } catch(e) {
		        	useBase64 = false;
		        }
		    }

		    returner = "'data:image/svg+xml" + (useBase64 ? ";base64" : "") + "," + returner + "'";
		    return new(tree.URL)(new(tree.Anonymous)(returner));
		}
	};

	// math
	for (var f in mathFunctions) {
		module.exports[f] = _math.bind(null, Math[f], mathFunctions[f]);
	}

	// color blending
	for (f in colorBlendMode) {
		module.exports[f] = colorBlend.bind(null, colorBlendMode[f]);
	}

	return module.exports;
});