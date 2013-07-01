var ports = {};
var storage = chrome.storage.local;

// How many uri's settings can be saved in storage
const MAX_PAGE_SETTINGS = 30;

function getPageSettings(tabId, callback) {
	if (!tabId) {
		return callback(null);
	}

	chrome.tabs.get(tabId, function(tab) {
		if (!tab) {
			return callback(null);
		}

		storage.get('pageSettings', function(obj) {
			var data = obj.pageSettings || [];
			var url = tab.url;
			var ix = findPageSettingsForURL(data, url);
			if (~ix) {
				return callback(data[ix][1], url, {
					index: ix,
					full: data
				});
			}

			callback(null, url);
		});
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
			getPageSettings(request.data.tabId, function(value) {
				sendResponse(value);
			});
			return true;
		case 'setPageSettings':
			getPageSettings(request.data.tabId, function(value, url, info) {
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
	if (!(port.name in ports)) {
		ports[port.name] = [];
	}

	ports[port.name].push(port);

	port.onDisconnect.addListener(function(port) {
		if (port.name in ports) {
			ports[port.name] = ports[port.name].filter(function(p) {
				return p !== port;
			});
		}
	});
});