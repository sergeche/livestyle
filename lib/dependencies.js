/**
 * Dependency manager for stylesheets:
 * keeps track of all available dependencies for given tree
 * that can provide variable and mixin scopes
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var tree = require('./tree');
	var logger = require('./logger');
	var path = require('./path');

	// global cache for parsed trees of dependencies
	var cache = {};
	var cachedValues = {};

	function findFile(base, files) {
		for (var i = files.length - 1, p; i >= 0; i--) {
			p = path.normalize(path.join(base, files[i]));
			if (p in cache) {
				return p;
			}
		}

		return null;
	}

	return {
		/**
		 * Parses dependencies payload. The payload must already
		 * contain ordered plain list of dependencies for host file
		 * @param  {Array} payload List of dependencies
		 * @return {Array}         List of parsed trees
		 */
		parse: function(payload) {
			var now = Date.now();
			var out = [];
			payload.forEach(function(item) {
				var t = cache[item.url];
				if (t && t.__depCRC == item.crc) {
					// we have cached tree, validate it 
					t.__depAccessTime = now;
					return out.push(t);
				}

				// cached tree either missing or invalid
				try {
					t = tree.build(item.content);
				} catch (e) {
					logger.error('Unable to parse dependency ' + item.url, e);
					return;
				}
				
				t.__depCRC = item.crc;
				t.__depAccessTime = now;
				cache[item.url] = t;
				out.push(t);
			});

			return out;
		},

		/**
		 * Sanitizes URL, found in stylesheet: removes quotes and `url()` if needed
		 * @param {String} url
		 * @return {String}
		 */
		sanitizeURL: function(url) {
			url = url.trim();
			if (url.indexOf('url(') === 0) {
				url = url.substring(4, url.length - 1);
			}

			var ch = url.charAt(0);
			if (ch == '"' || ch == "'") {
				url = url.substring(1, url.length - 1);
			}

			return url.trim();
		},

		/**
		 * Locates cached dependency tree for given host file
		 * @param  {String} baseURL Host file URL
		 * @param  {String} depURL  Dependency URL, as defined in stylesheet
		 * @return {CSSNode}
		 */
		locate: function(baseURL, depURL) {
			depURL = this.sanitizeURL(depURL);

			if (path.isAbsolute(depURL)) {
				depURL = depURL.substr(1);
			}

			var base = path.dirname(baseURL);
			var files = [depURL, depURL + '.less'];
			var parent = base;
			var prevParent = null;
			var f;
			while (parent && parent !== prevParent) {
				f = findFile(base, files);
				if (f && f in cache) {
					return cache[f];
				}

				prevParent = parent;
				parent = path.dirname(parent);
			}
		},

		/**
		 * Returns `true` if module contains valid caches for givan payload.
		 * This method can be used to determine if its safe to use cached
		 * data for given payload
		 * @param  {Array} payload
		 * @return {Boolean}
		 */
		validCache: function(payload) {
			for (var i = 0, il = payload.length, t; i < il; i++) {
				t = cache[payload[i].url];
				if (!t || t.__depCRC != payload[i].crc) {
					return false;
				}
			}

			return true;
		},

		/**
		 * Creates cache key for given dependencies payload. This
		 * key can be used to validate cache state
		 * @param  {Array} payload
		 * @return {String}
		 */
		cacheKey: function(payload) {
			return _.pluck(payload, 'crc').join('|');
		},

		/**
		 * Generic method for storing and retreiving data from
		 * dependencies that can be cached. 
		 * @param  {String} key    Key name of cached item
		 * @param  {Array} payload Dependencies payload
		 * @param  {Function} factory Factory method that takes parsed trees from
		 * payload and should return a value that must be cached.
		 * @return {Object}
		 */
		cachedValue: function(key, payload, factory) {
			var out;
			if (!key) {
				return factory(this.parse(payload));
			}

			var cacheKey = this.cacheKey(payload);
			if (key in cachedValues && cachedValues[key].cacheKey === cacheKey) {
				out = cachedValues[key];
				out.accessTime = Date.now();
				return out.value;
			}

			out = {
				accessTime: Date.now(),
				cacheKey: cacheKey,
				value: factory(this.parse(payload))
			};

			cachedValues[key] = out;
			return out.value;
		},

		free: function(delta) {
			var time = Date.now() - delta;
			for (var p in cache) {
				if (cache[p].__depAccessTime <= time) {
					delete cache[p];
				}
			}

			for (var p in cachedValues) {
				if (cachedValues[p].accessTime <= time) {
					delete cachedValues[p];
				}
			}
		}
	};
});