require.config({
	paths: {
		chrome: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'socket', 'chrome/utils'], function(_, socket, utils) {
	var ports = {};
	var storage = chrome.storage.local;
	var editorId = {};

	// How many uri's settings can be saved in storage
	const MAX_PAGE_SETTINGS = 30;

	function getPageSettings(data, callback) {
		if (!data || !(data.tabId || data.url)) {
			console.error('No data for page settings');
			return callback(null);
		}

		if (data.url) {
			_getPageSettingsByUrl(data.url, callback);
		} else {
			chrome.tabs.get(data.tabId, function(tab) {
				if (!tab) {
					return callback(null);
				}
				_getPageSettingsByUrl(tab.url, callback);
			});
		}
	}

	/**
	 * Internal function to retreive page settings for given URL
	 * @param  {String}   url      Page URL
	 * @param  {Function} callback
	 */
	function _getPageSettingsByUrl(url, callback) {
		storage.get('pageSettings', function(obj) {
			var data = obj.pageSettings || [];
			var ix = findPageSettingsForURL(data, url);
			if (~ix) {
				return callback(data[ix][1], url, {
					index: ix,
					full: data
				});
			}

			callback(null, url);
		});
	}

	/**
	 * Locates page settings for given URL in common storage
	 * and returns its index
	 * @param  {Array} settings Common settings stirage
	 * @param  {String} url      Page URL
	 * @return {Number} Index in `settings` array. Returns -1 if nothing found
	 */
	function findPageSettingsForURL(settings, url) {
		for (var i = 0; i < settings.length; i++) {
			if (settings[i][0] === url) {
				return i;
			}
		}

		return -1;
	}

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
		getPageSettings({tabId: message.tabId}, function(settings) {
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

	// dispatch all storage changes
	chrome.storage.onChanged.addListener(function(changes, areaName) {
		if ('pageSettings' in changes) {
			sendPortMessage('all', {
				action: 'pageSettingsChanged',
				data: changes.pageSettings
			});
		}
	});

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
				getPageSettings(request.data, function(value) {
					sendResponse(value);
				});
				return true;
			case 'setPageSettings':
				getPageSettings(request.data, function(value, url, info) {
					var fullData = info ? info.full : [];
					if (value && info) {
						fullData[info.index][1] = request.data.value;
					} else {
						while (fullData.length >= MAX_PAGE_SETTINGS) {
							fullData.shift();
						}

						fullData.push([url, request.data.value]);
					}

					storage.set({'pageSettings': fullData}, function() {
						if (chrome.runtime.lastError) {
							console.log('Got error on save:', chrome.runtime.lastError);
						}
					});
				});
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