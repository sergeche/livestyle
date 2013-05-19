var ports = {};

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.action) {
		case 'notify':
			webkitNotifications.createNotification('icon48.png', request.title || 'Notification', request.message).show();
			break;
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