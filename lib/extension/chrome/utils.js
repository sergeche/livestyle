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

			var message = {
				action: args[0],
				data: args[1]
			};

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
			this.dispatchMessage('portMessage', {
				port: targetPort,
				message: {
					action: action,
					data: data
				}
			});
		},

		/**
		 * Chrome resource iterator
		 */
		resources: function() {
			var callback = _.last(arguments);
			var cond = _.initial(arguments);
			var prop = null, val = null;
			if (cond.length == 2) {
				prop = cond[0];
				val = cond[1];
			} else if (cond.length == 1) {
				prop = 'url';
				val = cond[0];
			}

			chrome.devtools.inspectedWindow.getResources(function(resources) {
				resources.forEach(function(item, i, resources) {
					if (prop === null || item[prop] === val) {
						callback(item, i, resources);
					}
				});
			});
		}
	};
});