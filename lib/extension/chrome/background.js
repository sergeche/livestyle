require.config({
	paths: {
		chrome: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'socket', 'chrome/utils', 'chrome/pageSettings', 'chrome/ports'], function(_, socket, utils, pageSettings, ports) {
	var editorId = {};

	/**
	 * Check if socket connection should be opened or closed
	 */
	function checkSocketStatus() {
		if (ports.list().length) {
			socket.connect();
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
			case 'addUserFile':
				chrome.tabs.executeScript(request.data.tabId, {
					code: '(function(refs) {' +
						'var out = [];' +
						'while (refs.length) {' +
						'var r = refs.shift();' +
						'var b = new Blob(["/* livestyle:" + r + " */"], {type: "text/css"});' +
						'var link = document.createElement("link");' +
						'link.setAttribute("rel", "stylesheet");' +
						'link.href = window.URL.createObjectURL(b);'+
						'document.head.appendChild(link);' +
						'out.push(link.href)' +
						'}' +
						'return out;' +
						'})(' + JSON.stringify(request.data.refs) + ')'
				}, function(resp) {
					console.log('resp', resp[0]);
					ports.sendMessage('all', {
						action: 'userFileAdded',
						data: resp[0]
					});
				});
				return true;
			case 'removeUserFile':
				chrome.tabs.executeScript(request.data.tabId, {
					code: '(function(url) {' +
						'var links = document.getElementsByTagName("link");' +
						'links = Array.prototype.slice.call(links, 0);' +
						'links.forEach(function(l) {' + 
						'if (l.href === url) l.parentNode.removeChild(l);' +
						'})' +
						'})("' + request.data.url + '")'
				});
				ports.sendMessage('all', {
					action: 'userFileRemoved',
					data: request.data.url
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
		.on('message', function(msg) {
			if (msg.action == 'id') {
				console.log('Got editor ID', msg.data);
				editorId = msg.data;
			} else if (msg.action == 'updateFiles') {
				editorId.files = msg.data;
			}

			ports.sendMessage('all', {
				action: 'socketMessage',
				data: msg
			});
		})
		.on('error', function(msg) {
			console.log('Socket error:', msg);
		});
});