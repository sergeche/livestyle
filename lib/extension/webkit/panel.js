define(['lodash', 'dispatcher', 'socket', 'extension/panelView', 'extension/patchHistory', 'webkit/pageSettings', 'webkit/styles', 'webkit/utils'], function(_, dispatcher, socket, panelView, patchHistory, pageSettings, styles, utils) {
	var buttonAdded = false;
	var domain = typeof LIVESTYLE_URL != 'undefined' ? LIVESTYLE_URL : '';
	var btnImageUrl = domain + 'NavigationItemEmmet.pdf';

	var lsBtn = new WebInspector.ActivateButtonToolbarItem('livestyle', 'Show Emmet LiveStyle', 'Emmet LiveStyle', 'Emmet LiveStyle', btnImageUrl);
	lsBtn.addEventListener(WebInspector.ButtonNavigationItem.Event.Clicked, toggleLSView);
	lsBtn.enabled = true;

	var view = document.createElement('div');
	view.className = 'livestyle-webkit-view';
	view.appendChild(panelView.view);

	function toggleLSView() {
		if (!lsBtn.activated) {
			var bounds = lsBtn._element.getBoundingClientRect();
			view.style.left = (bounds.left - 15) + 'px';
			view.style.top = (bounds.bottom + 15) + 'px';
			document.body.appendChild(view);
			lsBtn.activated = true;
		} else {
			if (view.parentNode) {
				view.parentNode.removeChild(view);
			}

			lsBtn.activated = false;
		}
	}

	function saveBrowserFiles() {
		styles.all(function(res) {
			panelView.browserFiles = _.pluck(res, 'url');
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

	function startPanel() {
		if (!buttonAdded) {
			WebInspector.toolbar.addToolbarItem(lsBtn, WebInspector.Toolbar.Section.Left);
			buttonAdded = true;
		}

		pageSettings.get({url: utils.inspectedPageUrl()}, function(data) {
			updatePageSettings(data);
			saveBrowserFiles();
		});
	}

	function savePageSettings(newData) {
		pageSettings.save({
			url: utils.inspectedPageUrl(),
			value: newData || {}
		});
	}

	styles.on('add remove', saveBrowserFiles);

	socket
		.on('open', function() {
			panelView.socketActive = true;
		})
		.on('close', function() {
			panelView.socketActive = false;
		})
		.on('message', function(message) {
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
		});

	dispatcher
		.on('pageSettingsChanged', function(settings) {
			updatePageSettings(settings);
			// patchHistory.update(settings, panelView.view);
		})
		.on('start', startPanel);

	panelView
		.on('saveAssociations', function(assocs) {
			savePageSettings({assocs: assocs});
		})
		.on('socket:reload', function() {
			socket.check();
		})
		.on('enable', function() {
			savePageSettings({enabled: true});
		})
		.on('disable', function() {
			savePageSettings({enabled: false});
		});

	patchHistory.on('patchSelected', function(patch) {
		dispatcher.trigger('applyPatch', patch);
	});
});