/**
 * Module to work with user-created CSS files (Blobs).
 * Should be used in `devtools` context
 */
define(['lodash', 'chrome/utils', 'eventMixin'], function(_, utils, eventMixin) {
	var blobUrlLookup = {};
	var stylesCache = [];
	var reInternal = /^livestyle:/;
	var reBlob = /^blob:/;

	var _requestingStyles = false;
	var _deferedCallbacks = [];
	var saveBouncers = {};

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
		stylesCache.length = 0;
	}

	function addResource(res, target, callback) {
		res.getContent(function(content) {
			var url = internalUrl(res.url, content);
			if (url) {
				target.push({
					url: internalUrl(res.url, content),
					realUrl: res.url,
					content: content
				});
			}
			
			callback && callback();
		});
	}

	function addToCache(items) {
		var existing = _.pluck(stylesCache, 'url');
		items.forEach(function(item) {
			if (!_.include(existing, item.url)) {
				existing.push(item.realUrl);
				stylesCache.push(item);
				module.trigger('add', item);
			}
		})
	}

	function getStyles(callback) {
		_requestingStyles = true;
		utils.resources({type: 'stylesheet'}, function(res) {
			var out = [];
			var next = function() {
				if (res.length) {
					addResource(res.shift(), out, next);
				} else {
					addToCache(out);
					saveBlobLookups(out);
					_requestingStyles = false;
					_deferedCallbacks.forEach(function(cb) {cb(out);});
					_deferedCallbacks.length = 0;
					callback && callback(out);
				}
			};
			next();
		});
	}

	function saveBlobLookups(styles) {
		styles.forEach(function(item) {
			if (reInternal.test(item.url)) {
				blobUrlLookup[item.realUrl] = item.url;
			}
		});
	}

	function bglog(message) {
		utils.dispatchMessage('log', message);
	}

	function debounceSave(url, content, commit, options) {
		options = options || {};
		if (!saveBouncers[url]) {
			saveBouncers[url] = {
				url: url
			};
			var fn = (function() {
				var content = this.content;
				var url = this.url;
				utils.resources(url, function(res) {
					if (res.length) {
						res[0].setContent(content, commit);
					}
				});
				delete saveBouncers[this.url];
			}).bind(saveBouncers[url]);

			saveBouncers[url].fn = _.debounce(fn, options.debounce ? 2000 : 50);
		}

		var ctx = saveBouncers[url];
		ctx.content = content;
		ctx.commit = commit;
		ctx.fn();
	}

	chrome.devtools.inspectedWindow.onResourceAdded.addListener(function(res) {
		if (res.type == 'stylesheet') {
			var out = [];
			addResource(res, out, function() {
				// make sure resource url and content are resolved 
				// correctly before adding it to cache
				addToCache(out);
			});
		}
	});

	// chrome.devtools.inspectedWindow.onResourceContentCommitted.addListener(resetStylesCache);
	// chrome.devtools.network.onNavigated.addListener(resetStylesCache);

	var module = {
		/**
		 * Returns list of all CSS styles (URLs and contents) for current window
		 * @param {Function} callback
		 */
		all: function(callback) {
			if (stylesCache.length) {
				return callback(stylesCache);
			}

			_deferedCallbacks.push(callback);
			if (!_requestingStyles) {
				getStyles();
			}
		},

		/**
		 * Updates content of resource
		 * @param  {String}  url     Resource URL
		 * @param  {String}  content Resource content
		 * @param  {Boolean} commit  Commit resource to backend. 
		 * Should be either `true` or `false`, for any other
		 * value the content will not be pushed to backend
		 */
		update: function(url, content, commit, options) {
			this.content(url, function(c, item) {
				if (!item) return;

				item.content = content;
				if (_.isBoolean(commit)) {
					debounceSave(item.realUrl, content, commit, options);
					// utils.resources(item.realUrl, function(res) {
					// 	if (res.length) {
					// 		res[0].setContent(content, commit);
					// 	}
					// });
				}
			});
		},

		/**
		 * Returns content of stylesheet with given URL
		 * @param  {String}   url        Stylesheet URL
		 * @param {Boolean} fromBackend  Return resource content from backend
		 * @param  {Function} callback 
		 */
		content: function(url, fromBackend, callback) {
			var args = _.toArray(arguments);
			callback = _.last(args);
			args = _.initial(args);

			var returned = false;
			this.all(function(styles) {
				var item = _.find(styles, function(item) {
					if (item.url == url || item.realUrl == url) {
						if (args[1]) {
							// get real content from backend
							utils.resourceContent(item.realUrl, function(content) {
								callback(content, item);
							});
							return true;
						}

						callback(item.content, item);
						return true;
					}
				});

				if (!item) {
					callback(null);
				}
			});
		},

		/**
		 * Check if styles cache contains resource with
		 * given url
		 * @param  {String}  url
		 * @return {Boolean}
		 */
		has: function(url) {
			for (var i = stylesCache.length - 1, s; i >= 0; i--) {
				s = stylesCache[i];
				if (s.url == url || s.realUrl == url) {
					return s;
				}
			}

			return false;
		},

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
				// resetStylesCache();
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
			var item = this.has(_url);
			if (item) {
				bglog('Removing ' + item.url);
				stylesCache = _.without(stylesCache, item);
				this.trigger('remove', item);
			} else {
				bglog('Cannot remove ' + _url);
			}

			removeBlob(_url, function() {
				// resetStylesCache();
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
		},
		reset: resetStylesCache,
		_cache: function() {
			return stylesCache;
		}
	};

	return _.extend(module, eventMixin);
});