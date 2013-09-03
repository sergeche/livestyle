/**
 * Module to work with stylesheets
 */
define(['lodash', 'webkit/utils', 'eventMixin'], function(_, utils, eventMixin) {
	var blobUrlLookup = {};
	var stylesCache = [];
	var _deferedCallbacks = [];
	var _requestingStyles = false;

	function resetStylesCache() {
		stylesCache.length = 0;
	}

	function addResource(res, target, callback) {
		var url = res.url;
		var complete = function(content) {
			target.push({
				url: url,
				realUrl: url,
				content: content
			});
			callback && callback();
		}

		if (res.content) {
			complete(res.content);
		} else {
			res.requestContent(function() {
				complete(res.content);
			});
		}
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

	function requestContent(url, callback) {
		var res = utils.mainFrame().resourceForURL(url, false);
		if (res) {
			res.requestContent(function() {
				callback(res.content);
			});
		} else {
			callback(null);
		}
	}

	WebInspector.Frame.addEventListener(WebInspector.Frame.Event.ResourceWasAdded, function(evt) {
		var resource = evt.data.resource;
		if (resource.type == WebInspector.Resource.Type.Stylesheet) {
			var out = [];

			addResource(resource, out, function() {
				// make sure resource url and content are resolved 
				// correctly before adding it to cache
				addToCache(out);
			});
		}
	});

	var module = {
		/**
		 * Returns list of all CSS styles (URLs and contents) for current window
		 * @param {Function} callback
		 */
		all: function(callback) {
			return callback(stylesCache);
		},

		/**
		 * Updates content of resource
		 * @param  {String}  url     Resource URL
		 * @param  {String}  content Resource content
		 * @param  {Boolean} commit  Commit resource to backend. 
		 * Should be either `true` or `false`, for any other
		 * value the content will not be pushed to backend
		 */
		update: function(url, content, commit) {
			this.content(url, function(c, item) {
				if (!item) return;

				item.content = content;
				if (_.isBoolean(commit)) {
					var res = utils.mainFrame().resourceForURL(item.realUrl, false);
					if (res) {
						WebInspector.branchManager.currentBranch.revisionForRepresentedObject(res).content = content;
					}
				}
			})
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
							requestContent(item.url, function(content) {
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

		reset: resetStylesCache,
		_cache: function() {
			return stylesCache;
		}
	};

	return _.extend(module, eventMixin);
});