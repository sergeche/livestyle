require.config({
	paths: {
		chrome: './',
		lodash: '../vendor/lodash'
	}
});

require(['socket', 'chrome/utils', 'chrome/pageSettings', 'chrome/globalSettings', 'chrome/ports'], function(socket, utils, pageSettings, globalSettings, ports) {
	var editorId = {};
	var handshakeInfo = {
		id: 'chrome',
		supports: ['css']
	};

	var worker = new Worker('worker.js');
	worker.onmessage = function(evt) {
		var data = evt.data;
		switch (data.action) {
			case 'log':
				console.log(data.message);
				break;

			case 'diffExternalSources':
				socket.send({
					action: 'diff',
					data: {
						file: data.file, 
						success: data.success,
						result: data.result
					}
				});
				break;

			case 'patchExternalSource':
				socket.send({
					action: 'patch',
					data: {
						file: data.file, 
						success: data.success,
						result: data.result
					}
				});
				break;

			default:
				if (data.respondTo) {
					utils.sendPortMessage(data.respondTo, 'workerResponse', data);
				}
		}
	};

	/**
	 * Check if socket connection should be opened or closed
	 */
	function checkSocketStatus() {
		if (ports.list().length) {
			globalSettings.get(function(options) {
				socket.setup(options).connect(handshakeInfo);
			});
		} else {
			socket.disconnect();
		}
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
			ports.sendMessage('devtools', {
				action: 'patch',
				data: payload.data
			}, {excludeTabId: message.tabId});
		});
	}

	function handleSocketMessage(message) {
		switch (message.action) {
			case 'id':
				console.log('Got editor ID', message.data);
				editorId = message.data;
				break;

			case 'updateFiles':
				editorId.files = message.data;
				break;

			case 'diff':
			case 'patch':
				message.data.action = message.action == 'diff' 
					? 'diffExternalSources' 
					: 'patchExternalSource';
				worker.postMessage(message.data);
				
				// do not allow further message dispatching since data might be too large,
				// save some resources
				return; 
		}

		ports.sendMessage('all', {
			action: 'socketMessage',
			data: message
		});
	}

	// main messages
	chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
		switch (request.action) {
			case 'portMessage':
				ports.sendMessage(request.data.port, request.data.message);
				return true;
			case 'getTabUrl':
				chrome.tabs.get(request.data.tabId, function(tab) {
					sendResponse(tab ? tab.url : null);
				});
				return true;
			case 'runWorker':
				worker.postMessage(request.data);
				return true;
			case 'checkSocket':
				socket.check();
				return true;
			case 'sendSocket':
				socket.send(request.data);
				return true;
			case 'log':
				console.log(request.data);
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
			case 'error':
				console.error(request.data.message);
				socket.send({
					action: 'error',
					data: request.data
				});
				return true;
		}
	});

	chrome.extension.onConnect.addListener(function(port) {
		port.onDisconnect.addListener(checkSocketStatus);
		checkSocketStatus();
	});

	// Websocket event handler
	socket
		.on('open', function() {
			ports.sendMessage('all', {action: 'socketOpen'});
		})
		.on('close', function() {
			ports.sendMessage('all', {action: 'socketClose'});
		})
		.on('message', handleSocketMessage)
		.on('error', function(msg) {
			console.log('Socket error:', msg);
		});
});