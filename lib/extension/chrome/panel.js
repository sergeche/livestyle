require.config({
	paths: {
		chrome: './',
		extension: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'extension/panelView', 'chrome/utils'], function(_, panelView, utils) {
	var tabId = chrome.devtools.inspectedWindow.tabId;
	var port = chrome.extension.connect({name: 'panel:' + tabId});
	var pageSettings = {
		enabled: false,
		assocs: null,
		meta: {}
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

	function savePageSettings(newData) {
		utils.savePageSettings(_.extend(pageSettings, newData || {}));
	}

	function startPanel() {
		if (!chrome.devtools.inspectedWindow.tabId) {
			return;
		}

		utils.dispatchMessage('getPageSettings', {
			tabId: chrome.devtools.inspectedWindow.tabId
		}, function(data) {
			updatePageSettings(data);
			saveBrowserFiles();
			utils.dispatchMessage('requestEditorId', function(editorId) {
				panelView.identifyEditor(editorId);
			});
		});
	}

	/**
	 * Handles page settings change event
	 * @param  {Object} data Page settings storage change object
	 */
	function handlePageSettingsChange(data) {
		utils.dispatchMessage('getTabUrl', {
			tabId: chrome.devtools.inspectedWindow.tabId
		}, function(url) {
			if (!url) {
				return;
			}

			var settings = _.find(data.newValue || [], function(item) {
				return item[0] === url;
			});

			updatePageSettings(settings ? settings[1] : null);
		});
	}

	/**
	 * Updates view state with new settings
	 * @param  {Object} settings
	 */
	function updatePageSettings(settings) {
		_.extend(pageSettings, settings || {});
		panelView.pluginActive = pageSettings.enabled;
		panelView.assocs = pageSettings.assocs;
	}

	chrome.devtools.inspectedWindow.onResourceAdded.addListener(saveBrowserFiles);
	chrome.devtools.network.onNavigated.addListener(startPanel);

	panelView
		.on('saveAssociations', function(assocs) {
			savePageSettings({assocs: assocs});
		})
		.on('socket:reload', function() {
			utils.dispatchMessage('checkSocket');
		})
		.on('enable', function() {
			savePageSettings({enabled: true});
		})
		.on('disable', function() {
			savePageSettings({enabled: false});
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
			case 'pageSettingsChanged':
				handlePageSettingsChange(message.data);
				break;
		}
	});

	startPanel();
	document.body.appendChild(panelView.view);
});