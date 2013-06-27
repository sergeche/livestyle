require.config({
	paths: {
		chrome: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'socket', 'diff', 'patch', 'chrome/utils'], function(_, socket, diff, patch, utils) {
	var editorId = {};
	var port = chrome.extension.connect({name: 'devtools'});
	var styles = {};

	var pageSettings = {
		enabled: false,
		assocs: {}
	};

	var supressUpdate = false;
	var session = {};

	var worker = new Worker('worker.js');
	worker.onmessage = function(evt) {
		var data = evt.data;
		switch (data.action) {
			case 'patch':
				if (data.success) {
					styles[data.file] = data.result;
					utils.resources(data.file, function(item) {
						supressUpdate = true;
						item.setContent(styles[data.file], true);
					});
				}

				session[data.file].working = false;
				if (session[data.file].patches.length) {
					requestPatching(data.file);
				}
				break;
		}
	};

	/**
	 * Requests patching operation on given CSS source
	 * @param  {String} file  File name of patched CSS source
	 * @param  {Array} patch  Patches to apply
	 */
	function requestPatching(file, patches) {
		console.log('Request patching of', file);
		if (!(file in session)) {
			session[file] = {
				working: false,
				patches: []
			};
		}

		var s = session[file];
		if (!_.isArray(patches)) {
			patches = [patches];
		}

		if (patches) {
			s.patches = patch.condense(s.patches.concat(patches));
		}

		if (!s.working && s.patches.length) {
			console.log('Run patching');
			// run worker
			s.working = true;
			var _patches = s.patches;
			s.patches = [];

			worker.postMessage({
				action: 'patch',
				file: file,
				source: styles[file],
				patches: _patches
			});
		} else {
			console.log('Batch patching');
		}
	}

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

		requestPatching(browserFile, data.patch);
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

		// if (res.url in pageSettings.assocs) {
		// 	var patch = sourcer.makePatch(styles[res.url], content);
		// 	if (patch) {
		// 		styles[res.url] = content;
		// 		socket.send({
		// 			action: 'update',
		// 			data: {
		// 				browserFile: res.url,
		// 				editorFile: pageSettings.assocs[res.url],
		// 				patch: patch
		// 			}
		// 		});
		// 	}
		// }
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
	
	console.log('Starting extension');
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
					console.log('Got editor ID', msg.data);
					editorId = msg.data;
					break;
				case 'update':
					_.each(_.isArray(msg.data) ? msg.data : [msg.data], applyUpdate);
					break;
				case 'updateFiles':
					editorId.files = msg.data;
					break;
			}
			utils.sendPortMessage('all', 'socketMessage', msg);
		})
		.on('error', function(msg) {
			console.log('Socket error:', msg);
		})
		.connect();

	startExtension();
	chrome.devtools.panels.create('Emmet LiveStyle', 'icon48.png', 'panel.html');
});