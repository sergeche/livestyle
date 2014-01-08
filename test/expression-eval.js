var assert = require('assert');
var expr = require('../lib/expression');
var exprEvaluator = require('../lib/vendor/expression-eval');

describe('Expression evaluator', function() {
	var e = function(expression, vars) {
		var result = expr.eval(expression, vars);
		// console.log(result);
		return result;
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
		assert.equal(e('#fff'), '#fff');
		assert.equal(e('#555 + 2'), '#575757');
		assert.equal(e('#fff + 2'), '#ffffff');
		assert.equal(e('#111 + #222'), '#333333');
		assert.equal(e('3 * #111'), '#333333');
	});

	it('should use variables', function() {
		var ctx = {
			'@a': 2, '@b': 4,
			'$a': 2, '$b': 4,
			'@border-color': '#111',
			'foo': function(num) {
				return num.value * 3;
			}
		};

		assert.equal(e('1 + @a * @b', ctx), 9);
		assert.equal(e('1 + $a * $b', ctx), 9);
		assert.equal(e('3 + @border-color', ctx), '#141414');
		assert.equal(e('4 + foo(5)', ctx), '19');
		assert.equal(e('4 + foo(5, 6)', ctx), '19');

		assert.equal(e('bar(5, foo)', ctx), 'bar(5, foo)');
		assert.equal(e('foo', ctx), 'foo');
	});

	it('should split expression', function() {
		assert.equal(e('1 1'), '1 1');
		assert.equal(e('1px + 2 1 + 4px'), '3px 5px');
		assert.equal(e('1px + 2 (1 + 4px + (3*5) ) 8em'), '3px 20px 8em');
	});

	it('should find safe token', function() {
		var ctx = {a: 10, b: 11, c: 12};
		var t = function(expr) {
			var pe = exprEvaluator.parse(expr, ctx);
			var safeToken = pe.safeToken();
			if (safeToken) {
				return (safeToken.side == 'right' ? safeToken.op.index_ : '') + safeToken.value.valueOf();
			}
		};

		var v = function(expr) {
			return exprEvaluator.parse(expr, ctx).safeTokenValue();
		};

		assert.equal(t('1'), '1');
		assert.equal(t('-1'), '-1');
		assert.equal(t('#fc0'), '#ffcc00');
		
		assert.equal(t('1 + 2'), '+2');
		assert.equal(t('1 + 2 - 3'), '-3');
		assert.equal(t('1 + 2 - a'), '+2');
		assert.equal(t('1 - a'), '1');
		assert.equal(t('-1 - a'), '-1');
		assert.equal(t('(1 - a) + 2'), '+2');
		assert.equal(t('(1 - a) + b'), '1');
		assert.equal(t('(1 - a) / b'), undefined);
		assert.equal(t('c(1 - a)'), undefined);
		assert.equal(t('c(1 - a) + 2'), '+2');
		assert.equal(t('c(1 - a) + 2 - b(3)'), '+2');
		assert.equal(t('c(1 - a) + 2 - b(3/2)'), '+2');
		assert.equal(t('#fff + a'), '#ffffff');

		// test numeric value
		assert.equal(v('1 + 2'), 2);
		assert.equal(v('1 + 2 - 3'), -3);
		assert.equal(v('1 - a'), 1);
		assert.equal(v('-1 - a'), -1);
		assert.equal(v('#000'), 0);
		assert.equal(v('#010'), parseInt('11', 16) << 8);
	});

	it('should modify safe token', function() {
		var ctx = {a: 10, b: 11, c: 12};
		var r = function(expr, replacement) {
			var out = exprEvaluator.parse(expr, ctx).replaceSafeToken(replacement);
			return out;
		};

		// single value
		assert.equal(r('1px', '2px'), '2px');
		assert.equal(r('-1px', '2px'), '2px');
		assert.equal(r('#fc0', 'red'), 'red');

		// unknown token, can’t be safe
		assert.equal(r('foo', 'red'), null);
		
		assert.equal(r('1 + 2', '3'), '1 + 3');
		assert.equal(r('1 + 2 - 3', '-4'), '1 + 2 - 4');
		assert.equal(r('1 + 2 - a', '10'), '1 + 10 - a');
		assert.equal(r('1 - a', '5'), '5 - a');
		assert.equal(r('(1 - a)', '5'), '(5 - a)');
		assert.equal(r('(1 - a) + 2', '100'), '(1 - a) + 100');
		assert.equal(r('(1 - a) + b', '200'), '(200 - a) + b');
		assert.equal(r('c(1 - a) + 2', '3'), 'c(1 - a) + 3');
		assert.equal(r('c(1 - a) + 2 - b(3)', '4'), 'c(1 - a) + 4 - b(3)');
		assert.equal(r('c(1 - a) + 2 - b(3/2)', '5'), 'c(1 - a) + 5 - b(3/2)');
		assert.equal(r('c(1 - a) + 2 - b(3/2, 8)', '5'), 'c(1 - a) + 5 - b(3/2, 8)');

		// work with sign change
		assert.equal(r('1 + 2', '-2'), '1 - 2');
		assert.equal(r('1 - 2', '3'), '1 + 3');
		assert.equal(r('1 - a', '3'), '3 - a');
		assert.equal(r('1 - a', '-3'), '-3 - a');
		assert.equal(r('1 + a', '-3'), '-3 + a');
		assert.equal(r('-1 + a', '-3'), '-3 + a');
		assert.equal(r('-1 + a', '3'), '3 + a');

		// replace with zero
		assert.equal(r('1 + 2', '0'), '1');
		assert.equal(r('1 - 2', '0'), '1');
		assert.equal(r('a + 2', '0'), 'a');
		assert.equal(r('1 + a', '0'), 'a');
		assert.equal(r('-1 + a', '0'), 'a');
		assert.equal(r('-1 - a', '0'), '-a');

		// work with colors
		assert.equal(r('#fff + a', '#bc3'), '#bc3 + a');
		assert.equal(r('a + #fff', '#bc3'), 'a + #bc3');
		assert.equal(r('a + #fff', '-#bc3'), 'a - #bc3');
	});
});