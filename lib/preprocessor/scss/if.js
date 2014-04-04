/**
 * @if/@else if/@else resolver
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var expression = require('./expression');
	var logger = require('../../logger');

	var reIf = /^@if\b/;
	var reElseIf = /^@else\s+if\b/;
	var reElse = /^@else\b/;

	function collectStatements(node) {
		var out = {
			'if': [],
			'else': null
		};

		// the given statement must be @if
		out['if'].push({
			expr: node.name().replace(reIf, '').trim(),
			node: node
		});
		var list = node.parent.children;
		var sbl, sblName;
		for (var i = node.index() + 1, il = list.length; i < il; i++) {
			sbl = list[i];
			sblName = sbl.name();
			if (reElseIf.test(sblName)) {
				out['if'].push({
					expr: sblName.replace(reElseIf, '').trim(),
					node: sbl
				});
			} else if (reElse.test(sblName)) {
				out['else'] = sbl;
				break;
			} else {
				break;
			}
		}

		return out;
	}

	function isTrue(val) {
		return val !== false && val !== 'false' 
			&& val !== null && val !== 'null';
	}

	function resolveCondition(node, state) {
		var s = collectStatements(node), val;
		for (var i = 0, il = s['if'].length; i < il; i++) {
			try {
				val = expression.eval(s['if'][i].expr, state.variables, false);
				if (isTrue(val)) {
					return s['if'][i].node;
				}
			} catch (e) {
				logger.error('Unable to eval ' + s['if'][i].expr, e);
			}
		}

		return s['else'];
	}

	return {
		resolve: function(node, state) {
			var name = node.name();
			// skip @else if/@else section: 
			// they will be handled by resolveCondition() method
			if (reElseIf.test(name) || reElse.test(name)) {
				return true;
			}

			if (!reIf.test(name)) {
				return false;
			}

			var resolved = resolveCondition(node, state);
			if (resolved) {
				state.next(resolved, state);
			}

			return true;
		},

		isTrue: isTrue
	};
});