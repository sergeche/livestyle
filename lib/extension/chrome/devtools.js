require.config({
	paths: {
		chrome: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'diff', 'patch', 'chrome/utils'], function(_, diff, patch, utils) {
	if (!chrome.devtools.inspectedWindow.tabId) {
		return;
	}

	var MAX_PATCH_SESSIONS = 10;
	var INSPECTED_TAB_URL = null;

	var styles = {};
	var patchState = {};
	var diffState = {};
	var suppressed = {};

	var worker = new Worker('worker.js');
	worker.onmessage = function(evt) {
		var data = evt.data;
		switch (data.action) {
			case 'patch':
				var state = patchState[data.file];
				state.running = false;

				if (data.success) {
					styles[data.file] = data.result.source;
					utils.resources(data.file, function(item) {
						suppressUpdate(data.file);
						sourcePatched(data);
						item.setContent(styles[data.file], true);
					});
				} else {
					console.error(data.result);
				}

				if (state.patches.length) {
					requestPatching(data.file);
				}
				break;
			case 'diff':
				var state = diffState[data.file];
				state.running = false;

				if (data.success) {
					var result = data.result;
					styles[data.file] = result.source;

					if (result.patches && result.patches.length) {
						utils.dispatchMessage('diff', {
							tabId: chrome.devtools.inspectedWindow.tabId,
							url: data.file,
							patches: result.patches
						});
						// getPageSettings(function(settings) {
						// 	socket.send({
						// 		action: 'update',
						// 		data: {
						// 			browserFile: data.file,
						// 			editorFile: settings ? settings.assocs[data.file] : null,
						// 			patch: result.patches
						// 		}
						// 	});
						// 	sourcePatched(data);
						// });
					}
				} else {
					console.error(data.result);
				}

				if (state.required) {
					stte.required = false;
					extractPatch(data.file);
				}

				break;
		}
	};

	/**
	 * Tell all listeners that CSS file was updated (patched)
	 * @param  {Event} evt Worker event
	 */
	function sourcePatched(evt) {
		utils.sendPortMessage('all', 'sourcePatched', {
			url: evt.file,
			patches: evt.result.patches,
			source: evt.result.source
		});
	}

	/**
	 * Retreives inspected page settings and passes them
	 * to callback function
	 * @param  {Function} callback
	 */
	function getPageSettings(callback) {
		if (!INSPECTED_TAB_URL) {
			throw 'Tab URL should be requested first!';
		}

		var _callback = _.last(arguments);
		var args = _.initial(arguments);
		utils.dispatchMessage('getPageSettings', {
			url: INSPECTED_TAB_URL
		}, callback);
	}

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
		}
	}

	/**
	 * Applies incoming editor updates to CSS source
	 * @param  {Object} data Updates payload
	 */
	function applyUpdate(data, settings) {
		// find browser file
		var browserFile = data.browserFile;
		if (!browserFile || !(browserFile in styles)) {
			_.each(settings ? settings.assocs : [], function(v, k) {
				if (v == data.editorFile) {
					browserFile = k;
				}
			});
		}

		if (!browserFile || !(browserFile in styles)) {
			return console.error('No associated file found');
		}

		requestPatching(browserFile, data.patch);
	}

	function extractPatch(url) {
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

	function runSourcePatching(data) {
		getPageSettings(function(settings) {
			if (!settings || !settings.enabled) {
				return;
			}

			var payload = _.isArray(data) ? data : [data];
			payload.forEach(function(item) {
				applyUpdate(item, settings);
			});
		});
	}

	function startExtension() {
		INSPECTED_TAB_URL = null;
		saveStyles();
		utils.dispatchMessage('getTabUrl', {tabId: chrome.devtools.inspectedWindow.tabId}, function(url) {
			INSPECTED_TAB_URL = url;
			startPatchSession();
		});
	}

	/**
	 * Starts new patch session for inspected document
	 */
	function startPatchSession() {
		getPageSettings(function(settings) {
			settings = settings || {};
			if (!settings.meta) {
				settings.meta = {};
			}

			if (!settings.meta.patches) {
				settings.meta.patches = [];
			}

			// remove empty sessions
			var patches = settings.meta.patches.filter(function(item) {
				return !!item.length;
			});

			patches.push({
				date: Date.now(),
				patches: {}
			});

			while (patches.length > MAX_PATCH_SESSIONS) {
				patches.shift();
			}

			settings.meta.patches = patches;
			utils.savePageSettings(settings);
		});
	}

	// XXX init plugin
	console.log('Starting extension');
	var port = chrome.extension.connect({
		name: 'devtools:' + chrome.devtools.inspectedWindow.tabId
	});
	port.onMessage.addListener(function(message) {
		switch (message.action) {
			case 'socketMessage':
				if (message.data.action == 'update') {
					runSourcePatching(message.data.data);
				}
				break;
			case 'patch':
				runSourcePatching(message.data);
				break;
		}
	});

	chrome.devtools.inspectedWindow.onResourceContentCommitted.addListener(function(res, content) {
		if (res.url in suppressed) {
			delete suppressed[res.url];
			return;
		}

		getPageSettings(function(settings) {
			if (settings && settings.enabled) {
				extractPatch(res.url);
			} else {
				styles[res.url] = content;
			}
		});
	});

	chrome.devtools.inspectedWindow.onResourceAdded.addListener(saveStyles);
	chrome.devtools.network.onNavigated.addListener(startExtension);
	chrome.devtools.panels.create('Emmet LiveStyle', 'icon48.png', 'panel.html');
	startExtension();
});