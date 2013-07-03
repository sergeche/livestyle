var ports = {};
var storage = chrome.storage.local;

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
function sendPortMessage(portName, message) {
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
		targetPorts.forEach(function(p) {
			p.postMessage(message);
		});
	}
}

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

	}
});

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

chrome.extension.onConnect.addListener(function(port) {
	var nameParts = port.name.split(':');
	var portName = nameParts.shift();
	var tabId = nameParts[0] ? parseInt(nameParts[0]) : null;

	if (!(portName in ports)) {
		ports[portName] = [];
	}

	ports[portName].push(port);

	port.onDisconnect.addListener(function(port) {
		console.log('Disconnecting', port.name);
		if (portName in ports) {
			ports[portName] = ports[portName].filter(function(p) {
				return p !== port;
			});
		}
	});
});