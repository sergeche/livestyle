/**
 * Page settings storage
 */
define(['lodash', 'chrome/utils'], function(_, utils) {
	var storage = chrome.storage.local;
	// How many uri's settings can be saved in storage
	const MAX_PAGE_SETTINGS = 30;

	/**
	 * Internal function to retreive page settings for given URL
	 * @param  {String}   url      Page URL
	 * @param  {Function} callback
	 */
	function _getPageSettingsByUrl(url, callback) {
		storage.get('pageSettings', function(obj) {
			var data = obj.pageSettings || [];
			var ix = findPageSettingsForURL(data, url);
			if (~ix) {
				return callback(data[ix][1], url, {
					index: ix,
					full: data
				});
			}

			callback(null, url);
		});
	}

	/**
	 * Locates page settings for given URL in common storage
	 * and returns its index
	 * @param  {Array} settings Common settings stirage
	 * @param  {String} url      Page URL
	 * @return {Number} Index in `settings` array. Returns -1 if nothing found
	 */
	function findPageSettingsForURL(settings, url) {
		for (var i = 0; i < settings.length; i++) {
			if (settings[i][0] === url) {
				return i;
			}
		}

		return -1;
	}

	// dispatch all storage changes
	chrome.storage.onChanged.addListener(function(changes, areaName) {
		if ('pageSettings' in changes) {
			utils.sendPortMessage('all', 'pageSettingsChanged', changes.pageSettings);
		}
	});

	return {
		/**
		 * Retreive page settings for given data (url or tab ID)
		 * @param  {Object}   data
		 * @param  {Function} callback
		 */
		get: function(data, callback) {
			if (!data || !(data.tabId || data.url)) {
				console.error('No data for page settings');
				return callback(null);
			}

			if (data.url) {
				_getPageSettingsByUrl(data.url, callback);
			} else {
				chrome.tabs.get(data.tabId, function(tab) {
					if (!tab) {
						return callback(null);
					}
					_getPageSettingsByUrl(tab.url, callback);
				});
			}
		},

		/**
		 * Saves page settings
		 * @param  {Object} data Settings payload
		 */
		save: function(data) {
			this.get(data, function(value, url, info) {
				var fullData = info ? info.full : [];
				if (value && info) {
					fullData[info.index][1] = data.value;
				} else {
					while (fullData.length >= MAX_PAGE_SETTINGS) {
						fullData.shift();
					}

					fullData.push([url, data.value]);
				}

				storage.set({'pageSettings': fullData}, function() {
					if (chrome.runtime.lastError) {
						console.log('Got error on save:', chrome.runtime.lastError);
					}
				});
			});
		}
	};
});