require.config({
	paths: {
		chrome: './',
		extension: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'extension/panelView', 'chrome/utils'], function(_, panelView, utils) {
	var port = chrome.extension.connect({name: 'panel'});
	var pageSettings = {
		enabled: false,
		assocs: null
	};

	function saveBrowserFiles() {
		chrome.devtools.inspectedWindow.getResources(function(resources) {
			var styles = [];
			resources.forEach(function(item) {
				if (item.type == 'stylesheet') {
					styles.push(item.url);
				}
			});
			panelView.browserFiles = styles;
		});
	}

	/**
	 * Handles incoming websocket message
	 * @param  {Object} message
	 */
	function handleSocketMessage(message) {
		switch (message.action) {
			case 'id':
				panelView.identifyEditor(message.data);
				break;
			case 'updateFiles':
				panelView.editorFiles = message.data;
				break;
		}
	}

	function savePageSettings() {
		utils.dispatchMessage('setPageSettings', {
			tabId: chrome.devtools.inspectedWindow.tabId,
			value: pageSettings
		});
	}

	function startPanel() {
		utils.dispatchMessage('getPageSettings', {
			tabId: chrome.devtools.inspectedWindow.tabId
		}, function(data) {
			pageSettings = data || pageSettings;
			panelView.pluginActive = pageSettings.enabled;
			panelView.assocs = pageSettings.assocs;

			utils.sendPortMessage('devtools', 'requestEditorId', {
				respondTo: port.name
			});

			saveBrowserFiles();
		});
	}

	chrome.devtools.inspectedWindow.onResourceAdded.addListener(saveBrowserFiles);
	chrome.devtools.network.onNavigated.addListener(startPanel);

	panelView
		.on('saveAssociations', function(assocs) {
			pageSettings.assocs = assocs;
			utils.sendPortMessage('devtools', 'saveAssociations', assocs);
			savePageSettings();
		})
		.on('socket:reload', function() {
			utils.sendPortMessage('devtools', 'checkSocket');
		})
		.on('enable', function() {
			pageSettings.enabled = true;
			savePageSettings();
		})
		.on('disable', function() {
			pageSettings.enabled = false;
			savePageSettings();
		});;

	// update socket activity
	port.onMessage.addListener(function(message) {
		switch (message.action) {
			case 'socketOpen':
				panelView.socketActive = true;
				break;
			case 'socketClose':
				panelView.socketActive = false;
				break;
			case 'socketMessage':
				handleSocketMessage(message.data);
				break;
			case 'editorId':
				panelView.identifyEditor(message.data);
				break;
		}
	});

	startPanel();
	document.body.appendChild(panelView.view);
});