define(['lodash'], function(_) {

	return {
		dispatchMessage: function(name, data, callback) {
			var args = _.toArray(arguments);
			if (_.isFunction(_.last(args))) {
				callback = _.last(args);
				args = _.initial(args);
			} else {
				callback = null;
			}

			var message;
			if (_.isObject(args[0])) {
				message = args[0];
			} else {
				message = {action: args[0]};
			}

			message.data = args[1];

			if (callback) {
				chrome.runtime.sendMessage(message, callback);
			} else {
				chrome.runtime.sendMessage(message);
			}
		},

		/**
		 * Sends message to given port listeners
		 * @param  {String}   targetPort Destination port name
		 * @param  {String}   action     Action name
		 * @param  {Object}   data       Action payload
		 */
		sendPortMessage: function(targetPort, action, data) {
			if (targetPort != 'all' && !/:\d+$/.test(targetPort)) {
				targetPort += ':' + chrome.devtools.inspectedWindow.tabId;
			}

			this.dispatchMessage('portMessage', {
				port: targetPort,
				message: {
					action: action,
					data: data
				}
			});
		},

		/**
		 * Creates named communication port
		 * @param  {String} name Port name
		 * @return {Port}
		 */
		createPort: function(name) {
			var tabId = chrome.devtools.inspectedWindow.tabId;
			return chrome.extension.connect({
				name: name + ':' + tabId
			});
		},

		/**
		 * Retreives and filters list of external resources 
		 * for current window.
		 * @param {Object} filter Resource filter hash (object) or URL (string)
		 * @param {Function} callback
		 */
		resources: function(filter, callback) {
			callback = _.last(arguments);
			filter = _.initial(arguments)[0];

			if (filter && _.isString(filter)) {
				filter = {url: filter};
			}

			chrome.devtools.inspectedWindow.getResources(function(resources) {
				if (filter) {
					resources = resources.filter(function(res) {
						return Object.keys(filter).every(function(k) {
							return res[k] == filter[k];
						});
					});
				}

				callback(resources);
			});
		},

		/**
		 * Returns resource content by it's URL
		 * @param  {String}   url      Resource URL
		 * @param  {Function} callback 
		 */
		resourceContent: function(url, callback) {
			this.resources(url, function(res) {
				if (!res.length) {
					return callback(null);
				}

				res[0].getContent(callback);
			});
		},

		/**
		 * Utility function to get page settings for inspected
		 * window
		 * @param  {Function} callback
		 */
		getPageSettings: function(callback) {
			var that = this;
			this.dispatchMessage('getTabUrl', {
				tabId: chrome.devtools.inspectedWindow.tabId
			}, function(url) {
				that.dispatchMessage('getPageSettings', {url: url}, callback);
			});
		},

		/**
		 * Utility function to save settings of curently inspected page
		 * @param  {Object} settings 
		 */
		savePageSettings: function(settings) {
			this.dispatchMessage('setPageSettings', {
				tabId: chrome.devtools.inspectedWindow.tabId,
				value: settings
			});
		},

		/**
		 * Parses port name into group name and tab ID
		 * @param  {String} portName
		 * @return {Object}
		 */
		parsePortName: function(portName) {
			var nameParts = portName.split(':');
			return {
				name: nameParts[0],
				tabId: nameParts[1] ? parseInt(nameParts[1]) : null
			};
		},

		uuid: function() {
			return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
				var r = Math.random() * 16 | 0;
				var v = c == 'x' ? r : (r & 3 | 8);
				return v.toString(16);
			});
		}
	};
});