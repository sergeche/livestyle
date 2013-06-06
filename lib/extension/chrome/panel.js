require.config({
	paths: {
		chrome: './',
		extension: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'dispatcher', 'extension/panelView', 'chrome/utils'], function(_, dispatcher, panelView, utils) {
	var port = chrome.extension.connect({name: 'panel'});

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

	chrome.devtools.inspectedWindow.onResourceAdded.addListener(saveBrowserFiles);

	saveBrowserFiles();
	dispatcher
		.on('saveAssociations', function(assocs) {
			utils.sendPortMessage('devtools', 'saveAssociations', assocs);
		})
		.on('socket:reload', function() {
			utils.sendPortMessage('devtools', 'checkSocket');
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
			case 'editorId':
				panelView.identifyEditor(message.data);
				break;
		}
	});

	utils.sendPortMessage('devtools', 'requestEditorId', {
		respondTo: port.name
	});

	$(function() {
		panelView.pluginActive = true;
		document.body.appendChild(panelView.view);
	});
});