define(
['lodash', 'patch', 'diff', 'socket', 'dispatcher', 'webkit/panel', 'extension/panelView', 'webkit/styles', 'webkit/pageSettings', 'webkit/utils'], 
function(_, patch, diff, socket, dispatcher, panel, panelView, styles, pageSettings, utils) {
	var suppressed = {};
	var _panelCreated = false;
	var batchedUnsavedRequestUrls = [];
	var commitPatchedResource = true;
	var domain = typeof LIVESTYLE_URL != 'undefined' ? LIVESTYLE_URL : '';
	var handshakeInfo = {
		id: 'webkit',
		supports: ['css']
	};

	var patchQueue = [];
	patchQueue.running = false;
	var diffQueue = [];
	diffQueue.running = false;

	var worker = new Worker(domain + 'worker.js');
	worker.onmessage = function(evt) {
		var data = evt.data;
		switch (data.action) {
			case 'diffExternalSources':
				socket.send({
					action: 'diff',
					data: {
						file: data.file, 
						success: data.success,
						result: data.result
					}
				});
				break;

			case 'patchExternalSource':
				socket.send({
					action: 'patch',
					data: {
						file: data.file, 
						success: data.success,
						result: data.result
					}
				});
				break;

			case 'patch':
				patchQueue.running = false;
				if (data.success) {
					var styleItem = styles.has(data.file);
					if (commitPatchedResource && styleItem) {
						suppressUpdate(styleItem.realUrl);
					}
					styles.update(data.file, data.result.source, commitPatchedResource);
					sourcePatched(data);
				} else {
					console.error(data.result);
				}

				_runPatching();
				break;
			case 'diff':
				diffQueue.running = false;
				
				if (data.success) {
					var result = data.result;
					styles.update(data.file, result.source);

					if (result.patches && result.patches.length) {
						onDiffComplete({
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

			case 'diffUnsaved':
				pageSettings.getCurrent(function(settings) {
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
				break;
		}
	};

	/**
	 * Tell all listeners that CSS file was updated (patched)
	 * @param {Object} data Worker response
	 */
	function sourcePatched(data) {
		dispatcher.trigger('sourcePatched', {
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

	function onDiffComplete(data) {
		pageSettings.getCurrent(function(settings) {
			var payload = {
				action: 'update',
				data: {
					browserFile: data.url,
					editorFile: settings ? settings.assocs[data.url] : null,
					patch: data.patches
				}
			};
			socket.send(payload);
		});
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
			styles.content(p.url, function(content) {
				worker.postMessage({
					action: 'patch',
					file: p.url,
					source: content,
					patches: p.patches
				});
			});
		}
	}

	/**
	 * Requests diff operation on given CSS source
	 * @param  {String} url URL of CSS source
	 */
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
					worker.postMessage({
						action: 'diff',
						file: item.url,
						source1: item.content,
						source2: content
					});
				} else {
					diffQueue.running = false;
					_runDiff();
				}
			});
		}
	}

	/**
	 * Applies incoming editor updates to CSS source
	 * @param  {Object} data Updates payload
	 */
	function applyUpdate(data, settings) {
		var browserFile = data.browserFile;
		if (!browserFile || !styles.has(browserFile)) {
			_.each(settings.assocs, function(v, k) {
				if (v == data.editorFile) {
					browserFile = k;
				}
			});
		}

		if (!browserFile || !styles.has(browserFile)) {
			return console.error('No associated file found');
		}

		requestPatching(browserFile, data.patch);
	}

	function runSourcePatching(data) {
		pageSettings.getCurrent(function(settings) {
			if (!settings.enabled) {
				return;
			}

			var payload = _.isArray(data) ? data : [data];
			payload.forEach(function(item) {
				applyUpdate(item, settings);
			});
		});
	}

	function requestUnsavedChanges(stylesheet) {
		batchedUnsavedRequestUrls.push(stylesheet);
		_requestUnsavedChanges();
	}

	var _requestUnsavedChanges = _.debounce(function() {
		pageSettings.getCurrent(function(settings) {
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

			socket.send({
				action: 'requestUnsavedFiles',
				data: {
					files: files
				}
			});
		});
	}, 100);

	function startExtension() {
		styles.reset();
		createPanel();
		socket.connect(handshakeInfo);
	}

	function createPanel() {
		if (!_panelCreated) {
			// add CSS style
			var link = document.createElement('link');
			link.setAttribute('rel', 'stylesheet');
			link.href = domain + 'panel.css';
			document.head.appendChild(link);
			_panelCreated = true;
		}
	}

	////////////////////////////////////////////////////////////

	// handle resource change
	WebInspector.Resource.addEventListener(WebInspector.SourceCode.Event.ContentDidChange, function(evt) {
		var res = evt.target;
		var url = res.url;
		if (url in suppressed) {
			delete suppressed[url];
			return;
		}

		if (!styles.has(url)) {
			return;
		}

		pageSettings.getCurrent(function(settings) {
			if (settings.enabled) {
				requestDiff(url);
			} else {
				styles.update(url, content);
			}
		});
	});

	dispatcher.on('applyPatch', runSourcePatching);

	socket.on('message', function(message) {
		switch (message.action) {
			case 'update':
				runSourcePatching(message.data);
				break;

			case 'diff':
			case 'patch':
				message.data.action = message.action == 'diff' 
					? 'diffExternalSources' 
					: 'patchExternalSource';

				worker.postMessage(message.data);
				break;
			case 'unsavedFiles':
				worker.postMessage({
					action: 'diffUnsaved',
					data: message.data
				});
		}
	});

	styles.on('add', function(res) {
		requestUnsavedChanges(res.url);
	});

	var _isStarted = false;
	WebInspector.Frame.addEventListener(WebInspector.Frame.Event.MainResourceDidChange, function(evt) {
		if (!_isStarted) {
			_isStarted = true;
			setTimeout(function() {
				startExtension();
				dispatcher.trigger('start');
			}, 1);
		} else if (evt.target.isMainFrame()) {
			startExtension();
		}
	});
});