/**
 * Common media query resolver for preprocessors
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var reMedia = /@media\s*/i;

	/**
	 * Check if selector path contains media query
	 * @param  {Array} path List of CSS selectors
	 * @return {Boolean}
	 */
	function containsMediaQuery(path) {
		for (var i = path.length - 1; i >= 0; i--) {
			if (reMedia.test(path[i])) {
				return true;
			}
		}
		return false;
	}

	return {
		/**
		 * Fixes media queries in parsed selectors
		 * @param  {Array} list List of tree selectors
		 * @return {Array}      Transformed selectors list
		 */
		resolve: function(list) {
			var out = [];
			_.each(list, function(item) {
				if (!containsMediaQuery(item.path)) {
					return out.push(item);
				}

				var mq;
				var selectors = _.filter(item.path, function(sel) {
					if (!reMedia.test(sel)) {
						return true;
					}

					if (!mq) {
						mq = sel;
					} else {
						mq += ' and ' + sel.replace(reMedia, '');
					}
				});

				selectors.unshift(mq);
				out.push(_.defaults({path: selectors}, item));
			});

			return out;
		}
	};
});