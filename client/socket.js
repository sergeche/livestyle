define(['lodash', 'eventMixin'], function(_, eventMixin) {
	var url = 'ws://localhost:54000/browser';
	var sock = null;
	var retryTimeout = 5 * 1000;
	var autoRetry = false;

	function createSocket(callback) {
		var opened = false;
		var s = new WebSocket(url);
		s.onclose = function() {
			sock = null;
			module.trigger('close');

			if (!opened) {
				// cannot establish initial connection
				callback && callback(false);
				if (autoRetry) {
					setTimeout(createSocket, retryTimeout, callback);
				}
			}
		};

		s.onopen = function() {
			sock = s;
			opened = true;
			callback && callback(true, sock);
			module.trigger('open');
		};

		s.onmessage = function(evt) {
			module.trigger('message', JSON.parse(evt.data));
		};

		s.onerror = function(e) {
			module.trigger('error', e);
		};
	}

	
	var module = {
		/**
		 * Establishes socket connection
		 * @param  {Function} callback
		 */
		connect: function(callback) {
			if (!this.active()) {
				createSocket(callback);
			} else if (callback) {
				callback(true, sock);
			}
		},

		/**
		 * Check is socket is active and ready to use
		 * @return {Boolean}
		 */
		active: function() {
			return !!sock;
		},

		/**
		 * Check socket activity status. If it‘s not active, tries to re-connect
		 */
		check: function() {
			if (!this.active()) {
				createSocket();
			}
		},

		/**
		 * Sends given message to socket
		 * @param  {String} message
		 */
		send: function(message) {
			if (!_.isString(message)) {
				message = JSON.stringify(message);
			}

			if (this.active()) {
				sock.send(message);
			}
		}
	};

	return _.extend(module, eventMixin);
});