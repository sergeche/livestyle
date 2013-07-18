/**
 * Module to work with user-created CSS files (Blobs).
 * Should be used in `devtools` context
 */
define(['chrome/utils'], function(utils) {
	var blobUrlLookup = {};
	var stylesCache = null;
	var reInternal = /^livestyle:/;
	var reBlob = /^blob:/;

	function internalUrl(url, content) {
		if (reBlob.test(url)) {
			var m = content.match(/\/\*==\s+(livestyle:[\w\-]+)/);
			if (m) {
				url = m[1] === 'livestyle:removed' ? null : m[1];
			}
		}

		return url;
	}

	/**
	 * Requests Blob URLs for given user CSS files.
	 * This method is used to pre-cache blob URLs
	 * before they will be actually added to page as CSS
	 * files. Pre-cached URL can be referenced immediately
	 * for every user CSS operation
	 * @param  {Array}   internalURLs List of internal URLs
	 * @param  {Function} callback
	 */
	function requestBlobURLs(internalURLs, callback) {
		if (!Array.isArray(internalURLs)) {
			internalURLs = [internalURLs];
		}

		chrome.devtools.inspectedWindow.eval(
			'(function(refs) {' +
			'var out = [];' +
			'while (refs.length) {' +
			'var r = refs.shift();' +
			'var b = new Blob(["/*== " + r + " */\\n\\n"], {type: "text/css"});' +
			'out.push(window.URL.createObjectURL(b));' +
			'}' +
			'return out;' +
			'})(' + JSON.stringify(internalURLs) + ')'
		, function(resp, isError) {
			callback && callback(resp);
		});
	}

	/**
	 * Injects given blob URLs into page as user CSS files
	 * @param  {Array} urls Pre-cached Blob URLs
	 * @param  {Function} callback
	 */
	function injectBlobs(urls, callback) {
		if (!Array.isArray(urls)) {
			urls = [urls];
		}

		chrome.devtools.inspectedWindow.eval(
			'(function(refs) {' +
			'while (refs.length) {' +
			'var link = document.createElement("link");' +
			'link.setAttribute("rel", "stylesheet");' +
			'link.href = refs.shift();'+
			'document.head.appendChild(link);' +
			'}' +
			'})(' + JSON.stringify(urls) + ')'
		, function() {
			callback && callback(urls);
		});
	}

	/**
	 * Removes given blob URLs from page
	 * @param  {String} url Blob URLs
	 * @param  {Function} callback
	 */
	function removeBlob(url, callback) {
		// Chome has a bug: a blob resource created by URL.createObjectURL()
		// is not removed from DevTools resources after URL.revokeObjectURL()
		// call, so we have to explicitly mark it as removed
		
		utils.resources(url, function(res) {
			if (res.length) {
				res[0].setContent('/*== livestyle:removed */', true, function() {
					chrome.devtools.inspectedWindow.eval(
						'(function(url) {' +
						'var links = document.getElementsByTagName("link");' +
						'links = Array.prototype.slice.call(links, 0);' +
						'links.forEach(function(l) {' + 
						'if (l.href === url) l.parentNode.removeChild(l);' +
						'});' +
						'window.URL.revokeObjectURL(url);' +
						'})("' + url + '")'
					, function() {
						callback && callback(url);
					});
				});
			} else {
				callback && callback(url);
			}
		});
	}

	function resetStylesCache() {
		stylesCache = null;
	}

	function getStyles(callback) {
		if (stylesCache) {
			return callback(stylesCache);
		}

		utils.resources({type: 'stylesheet'}, function(res) {
			var out = [];
			var next = function() {
				if (res.length) {
					var r = res.shift();
					r.getContent(function(content) {
						var url = internalUrl(r.url, content);
						if (url) {
							out.push({
								url: internalUrl(r.url, content),
								realUrl: r.url,
								content: content
							});
						}
						
						next();
					});
				} else {
					stylesCache = out;
					callback(out);
				}
			};
			next();
		});
	}

	// save lookups
	getStyles(function(styles) {
		styles.forEach(function(item) {
			if (reInternal.test(item.url)) {
				blobUrlLookup[item.realUrl] = item.url;
			}
		});
	});

	chrome.devtools.inspectedWindow.onResourceAdded.addListener(resetStylesCache);
	chrome.devtools.inspectedWindow.onResourceContentCommitted.addListener(resetStylesCache);

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
			if (!Array.isArray(url)) {
				url = [url];
			}

			requestBlobURLs(url, function(blobUrls) {
				blobUrls.forEach(function(item, i) {
					blobUrlLookup[item] = url[i];
				});

				injectBlobs(blobUrls, callback);
				resetStylesCache();
			});
		},

		/**
		 * Removes given urls from inspected page
		 * @param {String} url URL to remove. Can be either
		 * internal or blob URL.
		 * @param  {Function} callback
		 */
		remove: function(url, callback) {
			var _url = this.isUserFile(url) ? this.lookupBlobUrl(url) : url;

			removeBlob(_url, function() {
				resetStylesCache();
				callback && callback(_url, url);
			});
		},

		/**
		 * Check if given URL is user defined
		 * @param  {String}  url
		 * @return {Boolean}
		 */
		isUserFile: function(url) {
			return reInternal.test(url);
		},

		isBlobFile: function(url) {
			return reBlob.test(url);
		},

		/**
		 * Generates internal file name for user style
		 * @return {String}
		 */
		generateUserFileName: function(suffix) {
			return 'livestyle:' + (suffix || utils.uuid());
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
		}
	}
});