require.config({
	paths: {
		chrome: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'diff', 'patch', 'chrome/utils', 'chrome/styles', 'chrome/globalSettings'], function(_, diff, patch, utils, styles, globalSettings) {
	if (!chrome.devtools.inspectedWindow.tabId) {
		return;
	}

	var tabId = chrome.devtools.inspectedWindow.tabId;
	var _panelCreated = false;
	var suppressed = {};
	var batchedUnsavedRequestUrls = [];
	var commitPatchedResource = false;

	var patchQueue = [];
	patchQueue.running = false;
	var diffQueue = [];
	diffQueue.running = false;
	var cssomQueue = [];
	cssomQueue.running = false;

	// load CSSOM patcher, it will be evaluated directly in inspected window
	var cssomTemplate;
	(function() {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', chrome.extension.getURL('./cssom.js'), false);
		xhr.send(null);
		cssomTemplate = xhr.responseText;
	})();


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
			tabId: tabId,
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

	function enqueuePatch(collection, url, patches) {
		// check if the same file is queued for patching
		var queuedItem = _.find(collection, function(item) {
			return item.url === url;
		});

		if (!queuedItem) {
			queuedItem = {
				url: url,
				patches: []
			};
			collection.push(queuedItem);
		}

		if (!Array.isArray(patches)) {
			patches = [patches];
		}

		queuedItem.patches = patch.condense(queuedItem.patches.concat(patches));
		return queuedItem;
	}

	/**
	 * Requests patching operation on given CSS source
	 * @param  {String} file  File name of patched CSS source
	 * @param  {Array} patch  Patches to apply
	 */
	function requestPatching(url, patches) {
		requestCSSOMPatching(url, patches);
		enqueuePatch(patchQueue, url, patches);
		_runPatching();
	}

	function _runPatching() {
		if (!patchQueue.running && patchQueue.length) {
			patchQueue.running = true;
			var p = patchQueue.shift();
			styles.content(p.url, function(content) {
				utils.dispatchMessage('runWorker', {
					action: 'patch',
					file: p.url,
					tabId: tabId,
					source: content,
					patches: p.patches,
					respondTo: port.name
				});
			});
		}
	}

	/**
	 * Requests CSSOM patching (for faster perceived performance) 
	 * operation on given CSS source
	 * @param  {String} file  File name of patched CSS source
	 * @param  {Array} patch  Patches to apply
	 */
	function requestCSSOMPatching(url, patches) {
		enqueuePatch(cssomQueue, url, patches);
		_runCSSOMPatching();
	}

	function _runCSSOMPatching() {
		if (!cssomQueue.running && cssomQueue.length) {
			cssomQueue.running = true;
			var p = cssomQueue.shift();

			if (!chrome.devtools.inspectedWindow || !cssomTemplate) {
				console.log('no window or no cssom');
				return;
			}

			var js = cssomTemplate.replace('%%PARAMS%%', JSON.stringify(p.url) + ', ' + JSON.stringify(p.patches));
			chrome.devtools.inspectedWindow.eval(js, function() {
				cssomQueue.running = false;
			});
		}
	}

	/**
	 * Applies incoming editor updates to CSS source
	 * @param  {Object} data Updates payload
	 */
	function applyUpdate(data, settings) {
		// console.log('apply update', data);
		// find browser file
		var browserFile = data.browserFile;
		if (!browserFile || !styles.has(browserFile)) {
			browserFile = [];
			_.each(settings.assocs, function(v, k) {
				if (v == data.editorFile && styles.has(k)) {
					browserFile.push(k);
				}
			});
		}

		if (!_.isArray(browserFile)) {
			browserFile = [browserFile];
		}

		browserFile.forEach(function(item) {
			if (item && styles.has(item)) {
				requestPatching(item, data.patch);
			}
		});
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

			styles.content(url, true, function(content, item) {
				if (content !== null) {
					utils.dispatchMessage('runWorker', {
						action: 'diff',
						file: item.url,
						source1: item.content,
						source2: content,
						respondTo: port.name
					});
				} else {
					diffQueue.running = false;
					_runDiff();
				}
			});
		}
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
		styles.remove(file, function(blob, internal) {
			utils.getPageSettings(function(settings) {
				if (settings.userfiles) {
					settings.userfiles = _.without(settings.userfiles, internal);
					utils.savePageSettings(settings);
				}
			});
		});
	}

	function updateBrowserFilesInPanel() {
		styles.all(function(res) {
			res = res.map(function(item) {
				return {
					url: item.url,
					isUserFile: styles.isUserFile(item.url)
				};
			});
			utils.sendPortMessage('panel', 'updateFiles', res);
		});
	}

	function handleSocketMessage(message) {
		if (message.action == 'update') {
			runSourcePatching(message.data);
		} else if (message.action == 'unsavedFiles') {
			utils.dispatchMessage('runWorker', {
				action: 'diffUnsaved',
				respondTo: port.name,
				data: message.data
			});
		}
	}

	function handleWorkerMessage(data) {
		if (data.action == 'patch') {
			patchQueue.running = false;
			if (data.success) {
				var styleItem = styles.has(data.file);
				if (commitPatchedResource && styleItem) {
					suppressUpdate(styleItem.realUrl);
				}
				styles.update(data.file, data.result.source, commitPatchedResource);
				sourcePatched(data);
			} else {
				displayError(data.result);
			}

			_runPatching();
		} else if (data.action == 'diff') {
			diffQueue.running = false;
			
			if (data.success) {
				var result = data.result;
				styles.update(data.file, result.source);

				if (result.patches && result.patches.length) {
					utils.dispatchMessage('diff', {
						tabId: tabId,
						url: data.file,
						patches: result.patches
					});
					sourcePatched(data);
				}
			} else {
				displayError(data.result);
			}

			_runDiff();
		} else if (data.action == 'diffUnsaved') {
			utils.getPageSettings(function(settings) {
				if (settings.assocs) {
					var payload = [];
					var assocs = {};
					_.each(settings.assocs, function(editorFile, browserFile) {
						if (editorFile) {
							assocs[editorFile] = browserFile;
						}
					});

					_.each(data.result.files, function(item) {
						if (assocs[item.file]) {
							payload.push({
								browserFile: assocs[item.file],
								patch: item.patches
							});
						}
					});

					if (payload.length) {
						runSourcePatching(payload);
					}
				}
			});
		}
	}

	function createPanel() {
		if (!_panelCreated) {
			chrome.devtools.panels.create('LiveStyle', 'icon-devtools.png', 'panel.html');
			_panelCreated = true;
		}
	}

	function requestUnsavedChanges(stylesheet) {
		batchedUnsavedRequestUrls.push(stylesheet);
		_requestUnsavedChanges();
	}

	var _requestUnsavedChanges = _.debounce(function() {
		utils.getPageSettings(function(settings) {
			if (!batchedUnsavedRequestUrls.length || !settings.assocs) {
				return;
			}

			var files = [];
			batchedUnsavedRequestUrls.forEach(function(url) {
				if (settings.assocs[url]) {
					files.push(settings.assocs[url]);
				}
			});

			batchedUnsavedRequestUrls.length = 0;
			files = _.uniq(_.compact(files));

			if (!files.length) {
				return;
			}

			globalSettings.get(function(options) {
				if (options.apply_unsaved) {
					utils.dispatchMessage('sendSocket', {
						action: 'requestUnsavedFiles',
						data: {
							files: files
						}
					});
				}
			});
		});
	}, 100);

	function startExtension() {
		styles.reset();
		styles.all(function(res) {
			utils.getPageSettings(function(settings) {
				if (settings.userfiles && settings.userfiles.length) {
					var urls = _.pluck(res, 'url');
					var userfiles = settings.userfiles.filter(function(f) {
						return !_.include(urls, f);
					});

					if (userfiles.length) {
						addUserFiles(userfiles);
					}
				}

				createPanel();
			});
		});
	}

	// XXX init plugin
	console.log('Starting LiveStyle extension');
	var port = utils.createPort('devtools');
	port.onMessage.addListener(function(message) {
		switch (message.action) {
			case 'socketMessage':
				handleSocketMessage(message.data);
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
			case 'requestFiles':
				updateBrowserFilesInPanel();
				break;
			case 'workerResponse':
				handleWorkerMessage(message.data);
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

		if (!styles.has(url)) {
			displayError('No "' + res.url + '" resource in styles cache');
			return;
		}

		utils.getPageSettings(function(settings) {
			if (settings.enabled) {
				requestDiff(url);
			} else {
				styles.update(url, content);
			}
		});
	});

	chrome.devtools.network.onNavigated.addListener(function() {
		utils.dispatchMessage('tabNavigated', {tabId: tabId});
		startExtension();
	});

	styles.on('add', function(res) {
		requestUnsavedChanges(res.url);
	});

	styles.on('add remove', function() {
		updateBrowserFilesInPanel();
	});

	startExtension();
});