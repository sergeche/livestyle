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

	var INSPECTED_TAB_URL = null;

	var styles = {};
	var suppressed = {};

	var patchQueue = [];
	patchQueue.running = false;
	var diffQueue = [];
	diffQueue.running = false;


	var worker = new Worker('worker.js');
	worker.onmessage = function(evt) {
		var data = evt.data;
		switch (data.action) {
			case 'patch':
				patchQueue.running = false;
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

				_runPatching();
				break;
			case 'diff':
				diffQueue.running = false;
				
				if (data.success) {
					var result = data.result;
					styles[data.file] = result.source;

					if (result.patches && result.patches.length) {
						utils.dispatchMessage('diff', {
							tabId: chrome.devtools.inspectedWindow.tabId,
							url: data.file,
							patches: result.patches
						});
						sourcePatched(data);
					}
				} else {
					console.error(data.result);
				}

				_runDiff();
				break;
		}
	};

	/**
	 * Tell all listeners that CSS file was updated (patched)
	 * @param {Object} data Worker response
	 */
	function sourcePatched(data) {
		utils.dispatchMessage('sourcePatched', {
			tabId: chrome.devtools.inspectedWindow.tabId,
			url: data.file,
			patches: data.result.patches,
			source: data.result.source
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
		// check if the same file is queued for patching
		var queuedItem = _.find(patchQueue, function(item) {
			return item.url === url;
		});

		if (!queuedItem) {
			queuedItem = {
				url: url,
				patches: []
			};
			patchQueue.push(queuedItem);
		}

		if (!_.isArray(patches)) {
			patches = [patches];
		}

		queuedItem.patches = patch.condense(queuedItem.patches.concat(patches));
		_runPatching();
	}

	function _runPatching() {
		if (!patchQueue.running && patchQueue.length) {
			patchQueue.running = true;
			var p = patchQueue.shift();
			worker.postMessage({
				action: 'patch',
				file: p.url,
				source: styles[p.url],
				patches: p.patches
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
			_.each(settings.assocs, function(v, k) {
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

	function requestDiff(url) {
		if (!_.include(diffQueue, url)) {
			console.log('Request diff', url);
			diffQueue.push(url);
		}
		_runDiff();
	}

	function _runDiff() {
		if (!diffQueue.running && diffQueue.length) {
			diffQueue.running = true;
			var url = diffQueue.shift();

			getResource(url, function(res) {
				if (res) {
					console.log('run diff', url);
					res.getContent(function(content) {
						worker.postMessage({
							action: 'diff',
							file: url,
							source1: styles[url],
							source2: content
						});
					});
				} else {
					console.log('skip diff', url);
					diffQueue.running = false;
					_runDiff();
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
			if (!settings.enabled) {
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
			if (settings.enabled) {
				requestDiff(res.url);
			} else {
				styles[res.url] = content;
			}
		});
	});

	chrome.devtools.inspectedWindow.onResourceAdded.addListener(saveStyles);
	chrome.devtools.network.onNavigated.addListener(function() {
		utils.dispatchMessage('tabNavigated', {tabId: chrome.devtools.inspectedWindow.tabId});
		startExtension();
	});
	chrome.devtools.panels.create('Emmet LiveStyle', 'icon48.png', 'panel.html');
	startExtension();
});