/**
 * Module to work with stylesheets
 */
define(['lodash', 'webkit/utils'], function(_, utils) {
	var blobUrlLookup = {};
	var stylesCache = null;

	function resetStylesCache() {
		stylesCache = null;
	}

	function requestContent(styleSheetId, callback) {
		var styleSheet = WebInspector.cssStyleManager.styleSheetForIdentifier(styleSheetId);
		styleSheet.requestContent(function(res) {
			callback(res.content);
		});
	}

	function getStyles(callback) {
		if (stylesCache) {
			return callback(stylesCache);
		}

		var styleList = utils.mainFrame().resourcesWithType(WebInspector.Resource.Type.Stylesheet).map(function(item) {
			return item.url;
		});

		CSSAgent.getAllStyleSheets(function(err, styleSheets) {
			if (err) {
				return callback(null);
			}

			var out = [];
			var next = function() {
				if (styleSheets.length) {
					var s = styleSheets.shift();
					if (_.include(styleList, s.sourceURL)) {
						requestContent(s.styleSheetId, function(content) {
							out.push({
								id: s.styleSheetId,
								url: s.sourceURL,
								realUrl: s.sourceURL,
								content: content
							});
							next();
						});
					} else {
						next();
					}
				} else {
					callback(stylesCache = out);
				}
			};

			next();
		});
	}

	WebInspector.Resource.addEventListener(WebInspector.SourceCode.Event.ContentDidChange, resetStylesCache);
	// handle resource add/update
	WebInspector.Resource.addEventListener(WebInspector.Resource.Event.URLDidChange, resetStylesCache);

	return {
		/**
		 * Returns list of all CSS styles (URLs and contents) for current window
		 * @param {Function} callback
		 */
		all: getStyles,

		/**
		 * Adds new user CSS to inspected page
		 * @param {String} url Internal URL (or array of URLs)
		 * @param {Function} callback
		 */
		add: function(url, callback) {
			console.error('Not implemented yet');
			callback(null);
		},

		/**
		 * Removes given urls from inspected page
		 * @param {String} url URL to remove. Can be either
		 * internal or blob URL.
		 * @param  {Function} callback
		 */
		remove: function(url, callback) {
			console.error('Not implemented yet');
			callback(null);
		},

		/**
		 * Check if given URL is user defined
		 * @param  {String}  url
		 * @return {Boolean}
		 */
		isUserFile: function(url) {
			// TODO implement
			return false;
		},

		isBlobFile: function(url) {
			// TODO implement
			return false;
		},

		/**
		 * Generates internal file name for user style
		 * @return {String}
		 */
		generateUserFileName: function(suffix) {
			// TODO implement
			return 'livestyle:user';
		},

		/**
		 * Locates internal URL for given blob one
		 * @param  {String} blobUrl
		 * @return {String}
		 */
		lookupInternalUrl: function(blobUrl) {
			return blobUrlLookup[blobUrl];
		},

		/**
		 * Locates blob URL for given internal one
		 * @param  {String} internalUrl
		 * @return {String}
		 */
		lookupBlobUrl: function(internalUrl) {
			var keys = Object.keys(blobUrlLookup);
			for (var i = keys.length - 1; i >= 0; i--) {
				if (blobUrlLookup[keys[i]] === internalUrl) {
					return keys[i];
				}
			}
		},

		/**
		 * Replaces content of resource with given
		 * @param  {String} url     Resource URL
		 * @param  {String} content New content
		 */
		replaceContent: function(url, content) {
			getStyles(function(res) {
				if (!res || !res.length) {
					return;
				}

				var r = _.find(res, function(item) {
					return item.realUrl == url;
				});

				if (r) {
					var styleSheet = WebInspector.cssStyleManager.styleSheetForIdentifier(r.id);
					WebInspector.branchManager.currentBranch.revisionForRepresentedObject(styleSheet).content = content;
				}
			});
		},

		requestResourceContent: function(url, callback) {
			CSSAgent.getAllStyleSheets(function(err, styleSheets) {
				if (err) {
					return callback(null);
				}

				var s = _.find(styleSheets, function(item) {
					return item.sourceURL == url || item.styleSheetId == url;
				});

				if (s) {
					requestContent(s.styleSheetId, callback);
				} else {
					callback(null);
				}
			});
		}
	}
});