if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var ev = require('./eventMixin');
	
	function toArray(obj) {
		return Array.prototype.slice.call(obj, 0);
	}

	return _.extend({
		log: function() {
			var args = toArray(arguments);
			console.log.apply(console, args);
			this.trigger('log', args);
		},
		warn: function() {
			var args = toArray(arguments);
			console.warn.apply(console, args);
			this.trigger('warn', args);
		},
		error: function() {
			var args = toArray(arguments);
			console.error.apply(console, args);
			this.trigger('error', args);
		}
	}, ev);
});