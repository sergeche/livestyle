/**
 * A helper object for keeping preprocessor transformation state.
 * Provides methods for safe cloning and extending state
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');

	function State(data) {
		_.extend(this, data);
	}

	State.prototype = {
		clone: function(data) {
			var clone = new State(this);
			if (data) {
				clone.extend(data);
			}
			return clone;
		},

		extend: function(data) {
			var self = this;
			_.forOwn(data, function(v, k) {
				if (_.isObject(v) && self[k]) {
					return self[k] = _.extend(Object.create(self[k]), v);
				}

				self[k] = v;
			});
			return this;
		}
	};

	return State;
});