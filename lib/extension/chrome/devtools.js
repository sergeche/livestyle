require.config({
	paths: {
		chrome: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'tree', 'locator', 'socket', 'sourcer', 'chrome/utils'], function(_, tree, locator, socket, sourcer, utils) {
	var diffMatchPatch = new diff_match_patch();
	diffMatchPatch.Patch_Margin = 16;

	var editorId = null;
	var port = chrome.extension.connect({name: 'devtools'});
	var styles = {};
	/**
	 * Browser-to-editor associations
	 * @type {Object}
	 */
	var assocs = {};

	/**
	 * Applies incoming editor updates to CSS source
	 * @param  {Object} data Updates payload
	 */
	function applyUpdates(data) {
		// find browser file
		var browserFile = null;
		_.each(assocs, function(v, k) {
			if (v == data.url) {
				browserFile = k;
			}
		});

		if (!browserFile) {
			console.log('No associated file found');
			return;
		}

		chrome.devtools.inspectedWindow.getResources(function(resources) {
			resources.forEach(function(item) {
				if (item.url == browserFile) {
					item.getContent(function(content) {
						content = sourcer.applyPatch(content, data.patch);
						styles[item.url] = content;
						item.setContent(content, true);
					});
				}
			});
		});
	}

	chrome.devtools.inspectedWindow.getResources(function(resources) {
		styles = {};
		resources.forEach(function(item) {
			if (item.type == 'stylesheet') {
				item.getContent(function(content) {
					styles[item.url] = content;
				});
			}
		});
	});

	chrome.devtools.inspectedWindow.onResourceContentCommitted.addListener(function(res, content) {
		if (res.url in styles) {
			var patch = sourcer.makePatch(styles[res.url], content);
			if (patch) {
				styles[res.url] = content;
				console.log(patch);
				return;
				socket.send({
					action: 'browserUpdated',
					data: {
						file: assocs[res.url],
						patch: patch
					}
				});
			}
		}
	});

	chrome.devtools.network.onNavigated.addListener(function() {
		console.info('A page reloaded');
		styles = {};
	});


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
				console.log('Save assocs', message.data);
				assocs = message.data;
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
				case 'editorUpdated':
					applyUpdates(msg.data);
					break;
			}
			utils.sendPortMessage('all', 'socketMessage', msg);
		})
		.connect();

	chrome.devtools.panels.create('Emmet LiveStyle', 'icon48.png', 'panel.html', function(panel) {		
		
	});
});