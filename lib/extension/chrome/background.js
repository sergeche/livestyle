var ports = {};
var storage = chrome.storage.local;

// How many uri's settings can be saved in storage
const MAX_PAGE_SETTINGS = 100;

function getPageSettings(tabId, callback) {
	chrome.tabs.get(tabId, function(tab) {
		if (!tab) {
			return callback(null);
		}

		var url = tab.url;
		storage.get('pageSettings', function(obj) {
			var data = obj.pageSettings || [];
			for (var i = 0; i < data.length; i++) {
				if (data[i][0] === url) {
					return callback(data[i][1], url, {
						index: i,
						full: data
					});
				}
			}

			callback(null, url);
		});

	})
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.action) {
		case 'portMessage':
			var portName = request.data.port;
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
					p.postMessage(request.data.message);
				});
			}
			
			break;
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