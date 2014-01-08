if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var ev = require('./eventMixin');
	var silent = false;
	
	function toArray(obj) {
		return Array.prototype.slice.call(obj, 0);
	}

	return _.extend({
		log: function() {
			var args = toArray(arguments);
			if (!silent) {
				console.log.apply(console, args);
			}
			this.trigger('log', args);
		},
		warn: function() {
			var args = toArray(arguments);
			if (!silent) {
				console.warn.apply(console, args);
			}
			this.trigger('warn', args);
		},
		error: function() {
			var args = toArray(arguments);
			if (!silent) {
				console.error.apply(console, args);
			}
			this.trigger('error', args);
		},
		silent: function(val) {
			if (typeof val != 'undefined') {
				silent = !!val;
			}
			return silent;
		}
	}, ev);
});