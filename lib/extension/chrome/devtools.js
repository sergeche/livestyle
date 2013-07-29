require.config({
	paths: {
		chrome: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'diff', 'patch', 'chrome/utils', 'chrome/styles'], function(_, diff, patch, utils, styles) {
	if (!chrome.devtools.inspectedWindow.tabId) {
		return;
	}

	var _panelCreated = false;
	var styleCache = {};
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
					var realUrl = styles.isUserFile(data.file) ? styles.lookupBlobUrl(data.file) : data.file;

					styleCache[data.file] = data.result.source;
					utils.resources(realUrl, function(res) {
						if (res.length) {
							suppressUpdate(realUrl);
							sourcePatched(data);
							res[0].setContent(styleCache[data.file], true);
						}
					});
				} else {
					displayError(data.result);
				}

				_runPatching();
				break;
			case 'diff':
				diffQueue.running = false;
				
				if (data.success) {
					var result = data.result;
					styleCache[data.file] = result.source;

					if (result.patches && result.patches.length) {
						utils.dispatchMessage('diff', {
							tabId: chrome.devtools.inspectedWindow.tabId,
							url: data.file,
							patches: result.patches
						});
						sourcePatched(data);
					}
				} else {
					displayError(data.result);
				}

				_runDiff();
				break;
		}
	};

	/**
	 * Displays error message in consoles (devtools and editor)
	 * @param  {String} message Error message
	 */
	function displayError(message) {
		console.error(message);
		utils.dispatchMessage('error', {message: message});
	}

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
				source: styleCache[p.url],
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
		if (!browserFile || !(browserFile in styleCache)) {
			_.each(settings.assocs, function(v, k) {
				if (v == data.editorFile) {
					browserFile = k;
				}
			});
		}

		if (!browserFile || !(browserFile in styleCache)) {
			return displayError('No associated file found');
		}

		requestPatching(browserFile, data.patch);
	}

	function requestDiff(url) {
		if (!_.include(diffQueue, url)) {
			diffQueue.push(url);
		}
		_runDiff();
	}

	function _runDiff() {
		if (!diffQueue.running && diffQueue.length) {
			diffQueue.running = true;
			var url = diffQueue.shift();
			var realUrl = styles.isUserFile(url) ? styles.lookupBlobUrl(url) : url;

			utils.resourceContent(realUrl, function(content) {
				if (content !== null) {
					if (styles.isBlobFile(url)) {
						url = styles.lookupInternalUrl(url);
					}

					worker.postMessage({
						action: 'diff',
						file: url,
						source1: styleCache[url],
						source2: content
					});
				} else {
					diffQueue.running = false;
					_runDiff();
				}
			});
		}
	}

	function saveStyles() {
		styleCache = {};
		styles.all(function(res) {
			res.forEach(function(r) {
				styleCache[r.url] = r.content;
			});
		});
	}

	function runSourcePatching(data) {
		utils.getPageSettings(function(settings) {
			if (!settings.enabled) {
				return;
			}

			var payload = _.isArray(data) ? data : [data];
			payload.forEach(function(item) {
				applyUpdate(item, settings);
			});
		});
	}
	function addUserFiles(files) {
		files = _.isArray(files) ? files : [files];
		styles.add(files, function() {
			utils.getPageSettings(function(settings) {
				if (!settings.userfiles) {
					settings.userfiles = [];
				}

				files.forEach(function(f) {
					if (!_.include(settings.userfiles, f)) {
						settings.userfiles.push(f);
					}
				});

				utils.savePageSettings(settings);
			});
		});
	}

	function removeUserFile(file) {
		// first, remove files from cache to override Chome bug
		// with persistent blob resources
		if (file in styleCache) {
			delete styleCache[file];
		}

		styles.remove(file, function(blob, internal) {
			utils.getPageSettings(function(settings) {
				if (settings.userfiles) {
					settings.userfiles = _.without(settings.userfiles, internal);
					utils.savePageSettings(settings);
					utils.sendPortMessage('panel', 'updateFiles');
				}
			});
		});
	}

	function createPanel() {
		if (!_panelCreated) {
			chrome.devtools.panels.create('LiveStyle', 'icon-devtools.png', 'panel.html');
			_panelCreated = true;
		}
	}

	function startExtension() {
		utils.getPageSettings(function(settings) {
			if (settings.userfiles && settings.userfiles.length) {
				styles.all(function(res) {
					res = _.pluck(res, 'url');
					var userfiles = settings.userfiles.filter(function(f) {
						return !_.include(res, f);
					});
					if (userfiles.length) {
						addUserFiles(userfiles);
					}
				});
			}

			saveStyles();
			createPanel();
		});
	}

	// XXX init plugin
	console.log('Starting LiveStyle extension');
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
			case 'addUserFile':
				addUserFiles(styles.generateUserFileName(message.data.name));
				break;
			case 'removeUserFile':
				removeUserFile(message.data);
				break;
		}
	});

	chrome.devtools.inspectedWindow.onResourceContentCommitted.addListener(function(res, content) {
		var url = res.url;
		if (styles.isBlobFile(url)) {
			url = styles.lookupInternalUrl(url);
		}

		if (res.url in suppressed) {
			delete suppressed[res.url];
			return;
		}

		if (!(url in styleCache)) {
			displayError('No "' + res.url + '" resource in styles cache');
			return;
		}

		utils.getPageSettings(function(settings) {
			if (settings.enabled) {
				requestDiff(url);
			} else {
				styleCache[url] = content;
			}
		});
	});

	chrome.devtools.inspectedWindow.onResourceAdded.addListener(saveStyles);
	chrome.devtools.network.onNavigated.addListener(function() {
		utils.dispatchMessage('tabNavigated', {tabId: chrome.devtools.inspectedWindow.tabId});
		startExtension();
	});
	startExtension();
});