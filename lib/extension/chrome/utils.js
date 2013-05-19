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
		}
	};
});