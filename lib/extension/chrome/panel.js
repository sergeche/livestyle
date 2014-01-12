require.config({
	paths: {
		chrome: './',
		extension: './',
		vendor: '../vendor',
		lodash: '../vendor/lodash',
		emSelect: '../vendor/emSelect'
	}
});

require(['lodash', 'extension/panelView', 'extension/patchHistory', 'chrome/utils'], function(_, panelView, patchHistory, utils) {
	var tabId = chrome.devtools.inspectedWindow.tabId;
	var port = utils.createPort('panel');

	function saveBrowserFiles(files) {
		var nativeRes = [], userRes = [];
		files.forEach(function(item) {
			if (item.isUserFile) {
				userRes.push(item.url);
			} else {
				nativeRes.push(item.url);
			}
		});

		nativeRes.sort();
		userRes.sort();
		
		panelView.browserFiles = nativeRes.concat(userRes);
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
			case 'renameFile':
				panelView.renameEditorFile(message.data.oldname, message.data.newname);
				break;
		}
	}

	function savePageSettings(newData) {
		utils.savePageSettings(newData || {});
	}

	function startPanel() {
		if (!tabId) {
			return;
		}

		utils.dispatchMessage('getPageSettings', {
			tabId: tabId
		}, function(data) {
			updatePageSettings(data);
			patchHistory.init(data);

			utils.dispatchMessage('requestEditorId', function(editorId) {
				panelView.identifyEditor(editorId);
			});

			utils.sendPortMessage('devtools', 'requestFiles');
		});
	}

	/**
	 * Handles page settings change event
	 * @param  {Object} data Page settings storage change object
	 */
	function handlePageSettingsChange(data) {
		utils.dispatchMessage('getTabUrl', {
			tabId: tabId
		}, function(url) {
			if (!url) {
				return;
			}

			var settings = _.find(data.newValue || [], function(item) {
				return item[0] === url;
			});

			if (settings) {
				updatePageSettings(settings[1]);
				patchHistory.update(settings[1]);
			}
		});
	}

	/**
	 * Updates view state with new settings
	 * @param  {Object} settings
	 */
	function updatePageSettings(settings) {
		if (!settings) {
			return;
		}
		panelView.pluginActive = settings.enabled;
		panelView.assocs = settings.assocs;
	}

	chrome.devtools.network.onNavigated.addListener(startPanel);

	panelView
		.on('saveAssociations', function(assocs) {
			savePageSettings({assocs: assocs});
		})
		.on('removeFile', function(file) {
			utils.sendPortMessage('devtools', 'removeUserFile', file);
		})
		.on('socket:reload', function() {
			utils.dispatchMessage('checkSocket');
		})
		.on('enable', function() {
			savePageSettings({enabled: true});
		})
		.on('disable', function() {
			savePageSettings({enabled: false});
		});

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
			case 'updateFiles':
				saveBrowserFiles(message.data);
				break;
		}
	});

	patchHistory.on('patchSelected', function(patch) {
		utils.sendPortMessage('devtools', 'patch', patch);
	});

	startPanel();
	document.body.appendChild(panelView.view);


	// “Add file” button
	var btn = document.createElement('button');
	btn.className = 'add-file';
	btn.innerText = 'Add file';
	btn.onclick = function() {
		utils.sendPortMessage('devtools', 'addUserFile', {name: utils.uuid()});
	};
	panelView.view.appendChild(btn);
});