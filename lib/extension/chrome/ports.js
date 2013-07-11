/**
 * Port listener and router, must be used in background page
 */
define(['lodash', 'chrome/utils'], function(_, utils) {
	var ports = {};
	var portFilters = {
		name: function(item) {
			return item.name == this.name;
		},
		tabId: function(item) {
			return item.tabId == this.tabId;
		},
		excludeTabId: function(item) {
			return item.tabId != this.excludeTabId;
		}
	}

	function onPortDisconnected(port) {
		var pn = utils.parsePortName(port.name);
		console.log('Disconnecting', port.name);
		if (pn.name in ports) {
			ports[pn.name] = ports[pn.name].filter(function(item) {
				return item.port !== port;
			});
		}
	}

	chrome.extension.onConnect.addListener(function(port) {
		var pn = utils.parsePortName(port.name);
		if (!(pn.name in ports)) {
			ports[pn.name] = [];
		}

		ports[pn.name].push({
			name: pn.name,
			tabId: pn.tabId,
			port: port
		});
		port.onDisconnect.addListener(onPortDisconnected);
	});

	return {
		/**
		 * Returns list of all connected ports
		 * @param {Object} filter Additional filters to narrow ports list
		 * @return {Array}
		 */
		list: function(filter) {
			filter = filter || {};
			var out = _(ports).values().flatten().value();
			_.each(portFilters, function(v, k) {
				if (k in filter) {
					out = _.filter(out, v, filter);
				}
			});

			return _.pluck(out, 'port');
		},

		/**
		 * Sends message to designated port listeners
		 * @param  {String} portName Port name to send data. Pass `all` to
		 * send values to all ports
		 * @param  {Object} message  Message to send
		 * @param {Object} options Additional options
		 */
		sendMessage: function(portName, message, options) {
			var filter = _.extend({}, options || {});
			var pn = utils.parsePortName(portName);
			
			if (pn.name !== 'all') {
				filter.name = pn.name;
			}

			if (pn.tabId) {
				filter.tabId = pn.tabId;
			}

			this.list(filter).forEach(function(port) {
				port.postMessage(message);
			});
		}
	};
});