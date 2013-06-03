require.config({
	paths: {
		chrome: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'tree', 'locator', 'socket', 'sourcer', 'chrome/utils'], function(_, tree, locator, socket, sourcer, utils) {
	var editorId = null;
	var port = chrome.extension.connect({name: 'devtools'});
	var styles = {};
	/**
	 * Browser-to-editor associations
	 * @type {Object}
	 */
	var assocs = {};

	var supressUpdate = false;


	/**
	 * Resource iterator
	 */
	function res() {
		var callback = _.last(arguments);
		var cond = _.initial(arguments);
		var prop = null, val = null;
		if (cond.length == 2) {
			prop = cond[0];
			val = cond[1];
		} else if (cond.length == 1) {
			prop = 'url';
			val = cond[0];
		}

		chrome.devtools.inspectedWindow.getResources(function(resources) {
			resources.forEach(function(item, i, resources) {
				if (prop === null || item[prop] === val) {
					callback(item, i, resources);
				}
			});
		});
	}

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

		res(browserFile, function(item) {
			item.getContent(function(content) {
				content = sourcer.applyPatch(content, data.patch);
				styles[item.url] = content;
				supressUpdate = true;
				item.setContent(content, true);
			});
		});
	}

	styles = {};
	res('type', 'stylesheet', function(item) {
		item.getContent(function(content) {
			styles[item.url] = content;
		});
	});

	chrome.devtools.inspectedWindow.onResourceContentCommitted.addListener(function(res, content) {
		if (supressUpdate) {
			return supressUpdate = false;
		}

		if (res.url in assocs) {
			var patch = sourcer.makePatch(styles[res.url], content);
			if (patch) {
				styles[res.url] = content;
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

	chrome.devtools.panels.create('Emmet LiveStyle', 'icon48.png', 'panel.html');
});