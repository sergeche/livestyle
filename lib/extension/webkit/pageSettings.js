/**
 * Page settings storage, must be used in background page
 */
define(['lodash', 'patch', 'dispatcher', 'webkit/utils'], function(_, patch, dispatcher, utils) {
	var module;
	// How many uri's settings can be saved in storage
	var MAX_PAGE_SETTINGS = 30;
	var MAX_PATCH_SESSIONS = 10;

	var _setting = new WebInspector.Setting('livestyle.pageSettings', []);

	var defaultSettings = {
		enabled: false,
		assocs: null,
		meta: {},
		userfiles: []
	};

	/**
	 * Internal function to retreive page settings for given URL
	 * @param  {String}   url
	 * @param  {Function} callback
	 */
	function getPageSettingsByUrl(url, callback) {
		var data = _setting.value || [];
		var ix = findPageSettingsForUrl(data, url);
		if (ix === -1) {
			data.push([url, _.cloneDeep(defaultSettings)]);
			ix = data.length - 1;
		}

		return callback(data[ix][1], url, {
			index: ix,
			full: data
		});
	}

	/**
	 * Locates page settings for given URL in common storage
	 * and returns its index
	 * @param  {Array} settings Common settings storage
	 * @param  {String} url      Page URL
	 * @return {Number} Index in `settings` array. Returns -1 if nothing found
	 */
	function findPageSettingsForUrl(settings, url) {
		for (var i = 0; i < settings.length; i++) {
			if (settings[i][0] === url) {
				return i;
			}
		}

		return -1;
	}

	/**
	 * Saves patch for given URL in patch history of page settings
	 * @param  {String} url   Inspected page URL
	 * @param  {Object} patch CSS patch
	 */
	function savePatchInHistory(url, styleUrl, patches) {
		getPageSettingsByUrl(url, function(settings) {
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

	/**
	 * Starts new patch session for inspected document
	 */
	function startPatchSession(url) {
		getPageSettingsByUrl(url, function(settings) {
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

	/**
	 * Returns url of updated resource that can be used for storing
	 * data in history.
	 * Particularly, this function returns proper url for
	 * user blobs
	 * @param  {Object} data Patch payload
	 * @return {String}
	 */
	function getUrlForHistory(data) {
		if (/^blob:/i.test(data.url)) {
			var m = data.source.match(/\/\*\s+(livestyle:[\w\-]+)/);
			return m ? m[1] : null;
		}

		return data.url;
	}

	// debug only: clear storage
	// storage.clear();
	dispatcher.on('start', function() {
		WebInspector.Frame.addEventListener(WebInspector.Frame.Event.MainResourceDidChange, function(evt) {
			if (!evt.target.isMainFrame()) {
				return;
			}
			startPatchSession(utils.inspectedPageUrl());
		});
		startPatchSession(utils.inspectedPageUrl());
	});
	

	dispatcher.on('sourcePatched', function(data) {
		savePatchInHistory(utils.inspectedPageUrl(), getUrlForHistory(data), data.patches);
	});

	return module = {
		/**
		 * Retreive page settings for given data (url or tab ID)
		 * @param  {Object}   data
		 * @param  {Function} callback
		 */
		get: function(data, callback) {
			if (!data || !data.url) {
				console.error('No data for page settings');
				return callback(null);
			}

			getPageSettingsByUrl(data.url, callback);
		},

		getCurrent: function(callback) {
			this.get({url: utils.inspectedPageUrl()}, callback);
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

				_setting.value = fullData;
				dispatcher.trigger('pageSettingsChanged', value);
			});
		}
	};
});