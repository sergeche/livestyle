if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var eventMixin = require('./eventMixin');

	var sock = null;
	var retryTimeout = 2000;
	var autoRetry = true;
	var _timer;
	var port = 54000;

	function createSocket(about, callback) {
		var opened = false;
		var s = new WebSocket('ws://127.0.0.1:' + port + '/browser');
		if (_timer) {
			clearTimeout(_timer);
			_timer = null;
		}

		s.onclose = function() {
			sock = null;
			module.trigger('close');

			if (!opened && callback) {
				// cannot establish initial connection
				callback(false);
			}

			if (autoRetry) {
				_timer = setTimeout(createSocket, retryTimeout, about, callback);
			}
		};

		s.onopen = function() {
			sock = s;
			opened = true;
			if (about) {
				this.send(JSON.stringify({
					action: 'handshake',
					data: about
				}));
			}

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
		setup: function(options) {
			if (options.port) {
				port = options.port;
			}

			return this;
		},

		/**
		 * Establishes socket connection
		 * @param {Object} about Handshake info about current client
		 * @param  {Function} callback
		 */
		connect: function(about, callback) {
			if (!this.active()) {
				autoRetry = true;
				createSocket(about, callback);
			} else if (callback) {
				callback(true, sock);
			}
		},

		/**
		 * Disconnects from socket
		 */
		disconnect: function() {
			if (this.active()) {
				autoRetry = false;
				sock.close();
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
				console.log('sending', message);
				message = JSON.stringify(message);
			}

			if (this.active()) {
				sock.send(message);
			}
		}
	};

	return _.extend(module, eventMixin);
});