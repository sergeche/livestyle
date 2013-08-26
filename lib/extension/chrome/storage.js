/**
 * A simple wrapper around Chrome Storage API.
 * Caches all requests to storage backend 
 */
define(function() {
	var storage = chrome.storage.local;
	var cache = {};

	function getCachedKey(key) {
		if (!cache[key]) {
			cache[key] = {
				value: null,
				requesting: false,
				callbacks: []
			};
		}

		return cache[key];
	}

	function requestStorageData(key) {
		var c = getCachedKey(key);
		if (c.requesting) {
			return;
		}

		c.requesting = true;
		storage.get(key, function(items) {
			c.value = items[key];
			c.requesting = false;
			var callbacks = c.callbacks, cb;
			c.callbacks = [];
			while (cb = callbacks.shift()) {
				cb(c.value);
			}
		});
	}

	// listen to change event and update cached values
	chrome.storage.onChanged.addListener(function(changes) {
		Object.keys(changes).forEach(function(k) {
			getCachedKey(k).value = changes[k].newValue;
		});
	});

	return {
		get: function(key, callback) {
			var c = getCachedKey(key);
			if (c.value === null) {
				// defer request to key
				c.callbacks.push(callback);
				requestStorageData(key);
			} else {
				callback(c.value);
			}
		},
		set: function(key, value) {
			var c = getCachedKey(key);
			c.value = value;
			var payload = {};
			payload[key] = value;
			storage.set(payload, function() {
				if (chrome.runtime.lastError) {
					console.error(chrome.runtime.lastError);
				}
			});
		},
		clear: function() {
			storage.clear();
		}
	};
});