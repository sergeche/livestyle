require.config({
	paths: {
		chrome: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'tree', 'locator', 'socket', 'sourcer', 'chrome/utils'], function(_, tree, locator, socket, sourcer, utils) {
	var editorId = {};
	var port = chrome.extension.connect({name: 'devtools'});
	var styles = {};

	var pageSettings = {
		enabled: false,
		assocs: {}
	};

	var supressUpdate = false;

	/**
	 * Applies incoming editor updates to CSS source
	 * @param  {Object} data Updates payload
	 */
	function applyUpdate(data) {
		// find browser file
		var browserFile = data.browserFile;
		if (!browserFile || !(browserFile in styles)) {
			_.each(pageSettings.assocs, function(v, k) {
				if (v == data.editorFile) {
					browserFile = k;
				}
			});
		}

		if (!browserFile || !(browserFile in styles)) {
			return console.log('No associated file found');
		}

		utils.resources(browserFile, function(item) {
			item.getContent(function(content) {
				content = sourcer.applyPatch(content, data.patch);
				styles[item.url] = content;
				supressUpdate = true;
				item.setContent(content, false);
			});
		});
	}

	function saveStyles() {
		styles = {};
		utils.resources('type', 'stylesheet', function(item) {
			item.getContent(function(content) {
				styles[item.url] = content;
			});
		});
	}

	function startExtension() {
		utils.dispatchMessage('getPageSettings', {
			tabId: chrome.devtools.inspectedWindow.tabId
		}, function(data) {
			pageSettings = data || pageSettings;
			saveStyles();
		});
	}

	chrome.devtools.inspectedWindow.onResourceContentCommitted.addListener(function(res, content) {
		if (supressUpdate || !pageSettings.enabled) {
			return supressUpdate = false;
		}

		if (res.url in pageSettings.assocs) {
			var patch = sourcer.makePatch(styles[res.url], content);
			if (patch) {
				styles[res.url] = content;
				socket.send({
					action: 'update',
					data: {
						browserFile: res.url,
						editorFile: pageSettings.assocs[res.url],
						patch: patch
					}
				});
			}
		}
	});

	chrome.devtools.inspectedWindow.onResourceAdded.addListener(saveStyles);
	chrome.devtools.network.onNavigated.addListener(startExtension);

	// XXX init plugin
	port.onMessage.addListener(function(message) {
		switch (message.action) {
			case 'requestEditorId':
				utils.sendPortMessage(message.data.respondTo || 'all', 'editorId', editorId);
				break;
			case 'checkSocket':
				socket.check();
				break;
			case 'saveAssociations':
				pageSettings.assocs = message.data;
				break;
			case 'enablePlugin':
				pageSettings.enabled = true;
				break;
			case 'disablePlugin':
				pageSettings.enabled = true;
				break;
		}
	});
	
	socket
		.on('open', function() {
			utils.sendPortMessage('all', 'socketOpen');
		})
		.on('close', function() {
			utils.sendPortMessage('all', 'socketClose');
		})
		.on('message', function(msg) {
			switch (msg.action) {
				case 'id':
					editorId = msg.data;
					break;
				case 'update':
					applyUpdate(msg.data);
					break;
				case 'updateFiles':
					editorId.files = msg.data;
					break;
			}
			utils.sendPortMessage('all', 'socketMessage', msg);
		})
		.connect();

	startExtension();
	chrome.devtools.panels.create('Emmet LiveStyle', 'icon48.png', 'panel.html');
});