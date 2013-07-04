require.config({
	paths: {
		chrome: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'socket', 'chrome/utils', 'chrome/pageSettings'], function(_, socket, utils, pageSettings) {
	var ports = {};
	var editorId = {};

	/**
	 * Sends message to designated port listeners
	 * @param  {String} portName Port name to send data. Pass `all` to
	 * send values to all ports
	 * @param  {Object} message  Message to send
	 */
	function sendPortMessage(portName, message, options) {
		options = options || {};
		var targetPorts = null;
		if (portName === 'all') {
			targetPorts = [];
			Object.keys(ports).forEach(function(p) {
				targetPorts = targetPorts.concat(ports[p]);
			});
		} else if (portName in ports) {
			targetPorts = ports[portName];
		}

		if (targetPorts) {
			if (options.excludeTabId) {
				targetPorts = targetPorts.filter(function(item) {
					return item.tabId !== options.excludeTabId;
				});
			}

			targetPorts.forEach(function(item) {
				item.port.postMessage(message);
			});
		}
	}

	/**
	 * Check if socket connection should be opened or closed
	 */
	function checkSocketStatus() {
		var hasConectedPorts = _.find(ports, function(v) {
			return v && v.length;
		});

		if (hasConectedPorts) {
			socket.connect();
		} else {
			socket.disconnect();
		}
	}

	/**
	 * Parses port name into group name and tab ID
	 * @param  {String} portName
	 * @return {Object}
	 */
	function parsePortName(portName) {
		var nameParts = portName.split(':');
		return {
			name: nameParts[0],
			tabId: nameParts[1] ? parseInt(nameParts[1]) : null
		};
	}

	function onPortDisconnected(port) {
		var pn = parsePortName(port.name);
		console.log('Disconnecting', port.name);
		if (pn.name in ports) {
			ports[pn.name] = ports[pn.name].filter(function(item) {
				return item.port !== port;
			});
		}
		checkSocketStatus();
	}

	function handleDiffMessage(message) {
		pageSettings.get({tabId: message.tabId}, function(settings) {
			var payload = {
				action: 'update',
				data: {
					browserFile: message.url,
					editorFile: settings ? settings.assocs[message.url] : null,
					patch: message.patches
				}
			};
			socket.send(payload);
			// tell other windows to patch source accordingly
			sendPortMessage('devtools', {
				action: 'patch',
				data: payload.data
			}, {excludeTabId: message.tabId});
		});
	}

	// debug only: clear storage
	// storage.clear();

	// main messages
	chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
		switch (request.action) {
			case 'portMessage':
				sendPortMessage(request.data.port, request.data.message);
				return true;
			case 'getTabUrl':
				chrome.tabs.get(request.data.tabId, function(tab) {
					sendResponse(tab ? tab.url : null);
				});
				return true;
			case 'checkSocket':
				socket.check();
				return true;
			case 'requestEditorId':
				sendResponse(editorId);
				return true;
			case 'getPageSettings':
				pageSettings.get(request.data, function(value) {
					sendResponse(value);
				});
				return true;
			case 'setPageSettings':
				pageSettings.save(request.data);
				return true;
			case 'diff':
				handleDiffMessage(request.data);
				return true;
		}
	});

	// port router
	chrome.extension.onConnect.addListener(function(port) {
		var pn = parsePortName(port.name);
		if (!(pn.name in ports)) {
			ports[pn.name] = [];
		}

		ports[pn.name].push({
			tabId: pn.tabId,
			port: port
		});
		port.onDisconnect.addListener(onPortDisconnected);
		checkSocketStatus();
	});

	// Websocket event handler
	socket
		.on('open', function() {
			utils.sendPortMessage('all', 'socketOpen');
		})
		.on('close', function() {
			utils.sendPortMessage('all', 'socketClose');
		})
		.on('message', function(msg) {
			if (msg.action == 'id') {
				console.log('Got editor ID', msg.data);
				editorId = msg.data;
			} else if (msg.action == 'updateFiles') {
				editorId.files = msg.data;
			}
			// console.log('Sending port message', msg);
			sendPortMessage('all', {
				action: 'socketMessage',
				data: msg
			});
			// utils.sendPortMessage('all', 'socketMessage', msg);
		})
		.on('error', function(msg) {
			console.log('Socket error:', msg);
		});
});