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

	var patchState = {};
	var diffState = {};
	var suppressed = {};

	var worker = new Worker('worker.js');
	worker.onmessage = function(evt) {
		console.log('Got worker response', evt);
		var data = evt.data;
		switch (data.action) {
			case 'patch':
				var state = patchState[data.file];
				state.running = false;

				if (data.success) {
					styles[data.file] = data.result;
					utils.resources(data.file, function(item) {
						suppressUpdate(data.file);
						item.setContent(styles[data.file], true);
					});
				}

				if (state.patches.length) {
					requestPatching(data.file);
				}
				break;
			case 'diff':
				var state = diffState[data.file];
				state.running = false;
				console.log('Got diff response');

				if (data.success) {
					var result = data.result;
					styles[data.file] = result.source;
					console.log('Patches', result.patches);
					if (result.patches && result.patches.length) {
						socket.send({
							action: 'update',
							data: {
								browserFile: data.file,
								editorFile: pageSettings.assocs[data.file],
								patch: result.patches
							}
						});
					}
				}

				if (state.required) {
					stte.required = false;
					extractPatch(data.file);
				}

				break;
		}
	};

	/**
	 * Marks given URL to suppress incoming update
	 * @param  {String} url
	 */
	function suppressUpdate(url) {
		suppressed[url] = true;
	}

	/**
	 * Requests patching operation on given CSS source
	 * @param  {String} file  File name of patched CSS source
	 * @param  {Array} patch  Patches to apply
	 */
	function requestPatching(url, patches) {
		console.log('Request patching of', url);
		if (!(url in patchState)) {
			patchState[url] = {
				working: false,
				patches: []
			};
		}

		var s = patchState[url];
		if (!_.isArray(patches)) {
			patches = [patches];
		}

		if (patches) {
			s.patches = patch.condense(s.patches.concat(patches));
		}

		if (!s.running && s.patches.length) {
			console.log('Run patching');
			// run worker
			s.running = true;
			var _patches = s.patches;
			s.patches = [];

			worker.postMessage({
				action: 'patch',
				file: url,
				source: styles[url],
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

	function extractPatch(url) {
		console.log('Request diff for', url);
		if (!(url in diffState)) {
			diffState[url] = {
				running: false,
				required: false
			};
		}

		var state = diffState[url];
		if (state.running) {
			state.required = true;
		} else {
			state.running = true;
			getResource(url, function(res) {
				if (res) {
					res.getContent(function(content) {
						worker.postMessage({
							action: 'diff',
							file: url,
							source1: styles[url],
							source2: content
						});
					});
				} else {
					state.running = false;
				}
			});
		}
	}

	function getResource(url, callback) {
		chrome.devtools.inspectedWindow.getResources(function(resources) {
			callback(_.find(resources, function(item) {
				return item.url === url;
			}));
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
		if (res.url in suppressed) {
			delete suppressed[res.url];
			return;
		}

		if (!pageSettings.enabled) {
			return;
		}

		extractPatch(res.url);
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