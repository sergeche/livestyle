/**
 * Page settings storage, must be used in background page
 */
define(['lodash', 'patch', 'chrome/utils', 'chrome/ports'], function(_, patch, utils, ports) {
	var module;
	var storage = chrome.storage.local;
	var inspectedTabs = {};
	// How many uri's settings can be saved in storage
	var MAX_PAGE_SETTINGS = 30;
	var MAX_PATCH_SESSIONS = 10;
	var defaultSettings = {
		enabled: false,
		assocs: null,
		meta: {}
	};

	/**
	 * Internal function to retreive page settings for given URL
	 * @param  {String}   url
	 * @param  {Function} callback
	 */
	function _getPageSettingsByUrl(url, callback) {
		storage.get('pageSettings', function(obj) {
			var data = obj.pageSettings || [];
			var ix = findPageSettingsForURL(data, url);
			if (ix === -1) {
				data.push([url, _.cloneDeep(defaultSettings)]);
				ix = data.length - 1;
			}

			return callback(data[ix][1], url, {
				index: ix,
				full: data
			});
		});
	}

	/**
	 * Locates page settings for given URL in common storage
	 * and returns its index
	 * @param  {Array} settings Common settings storage
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

	function onPortDisconnected(port) {
		var pn = utils.parsePortName(port.name);
		if (pn.tabId && pn.tabId in inspectedTabs) {
			inspectedTabs[pn.tabId].refcount--;
			if (inspectedTabs[pn.tabId].refcount < 1) {
				delete inspectedTabs[pn.tabId];
			}
		}
	}

	/**
	 * Saves patch for given URL in patch history of page settings
	 * @param  {String} url   Inspected page URL
	 * @param  {Object} patch CSS patch
	 */
	function savePatchInHistory(url, styleUrl, patches) {
		_getPageSettingsByUrl(url, function(settings) {
			if (!settings.meta.patchHistory) {
				return;
			}

			var h = _.last(settings.meta.patchHistory);
			if (h && h.styles) {
				if (!h.styles[styleUrl]) {
					h.styles[styleUrl] = [];
				}

				h.styles[styleUrl] = patch.condense(h.styles[styleUrl].concat(patches));
				module.save({
					url: url,
					value: settings
				});
			}
		});
	}

	function startPatchSessionIfNeeded(url) {
		var alreadyStarted = _.any(_.values(inspectedTabs), function(item) {
			return item.url === url;
		});

		if (!alreadyStarted) {
			startPatchSession(url);
		}
	}

	/**
	 * Starts new patch session for inspected document
	 */
	function startPatchSession(url) {
		_getPageSettingsByUrl(url, function(settings) {
			if (!settings.meta.patchHistory) {
				settings.meta.patchHistory = [];
			}

			// remove empty sessions
			var patchHistory = settings.meta.patchHistory.filter(function(item) {
				return !!Object.keys(item.styles).length;
			});

			patchHistory.push({
				date: Date.now(),
				styles: {}
			});

			while (patchHistory.length >= MAX_PATCH_SESSIONS) {
				patchHistory.shift();
			}

			settings.meta.patchHistory = patchHistory;
			module.save({
				url: url,
				value: settings
			});
		});
	}

	// debug only: clear storage
	// storage.clear();

	// dispatch all storage changes
	chrome.storage.onChanged.addListener(function(changes, areaName) {
		if ('pageSettings' in changes) {
			utils.sendPortMessage('all', 'pageSettingsChanged', changes.pageSettings);
		}
	});

	chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
		var data = request.data;
		if (request.action == 'tabNavigated') {
			var tabId = data.tabId;
			if (tabId in inspectedTabs) {
				chrome.tabs.get(tabId, function(tab) {
					startPatchSessionIfNeeded(tab.url);
					inspectedTabs[tabId].url = tab.url;
				});
			}
		} else if (request.action == 'sourcePatched') {
			if (data.tabId in inspectedTabs) {
				savePatchInHistory(inspectedTabs[data.tabId].url, data.url, data.patches);
			}
		}
	});

	chrome.extension.onConnect.addListener(function(port) {
		var pn = utils.parsePortName(port.name);
		if (pn.tabId) {
			chrome.tabs.get(pn.tabId, function(tab) {
				if (!inspectedTabs[pn.tabId]) {
					startPatchSessionIfNeeded(tab.url);
					inspectedTabs[pn.tabId] = {
						refcount: 0,
						url: tab.url
					};
				}

				inspectedTabs[pn.tabId].refcount++;
			});
		}
		port.onDisconnect.addListener(onPortDisconnected);
	});

	return module = {
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
				value = _.extend(value, data.value);
				if (info) {
					fullData[info.index][1] = value;
				} else {
					while (fullData.length >= MAX_PAGE_SETTINGS) {
						fullData.shift();
					}

					fullData.push([url, value]);
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