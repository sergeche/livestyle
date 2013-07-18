define(
['lodash', 'patch', 'diff', 'socket', 'dispatcher', 'webkit/panel', 'extension/panelView', 'webkit/styles', 'webkit/pageSettings', 'webkit/utils'], 
function(_, patch, diff, socket, dispatcher, panel, panelView, styles, pageSettings, utils) {
	var styleCache = {};
	var suppressed = {};
	var domain = typeof LIVESTYLE_URL != 'undefined' ? LIVESTYLE_URL : '';

	var patchQueue = [];
	patchQueue.running = false;
	var diffQueue = [];
	diffQueue.running = false;

	var worker = new Worker(domain + 'worker.js');
	worker.onmessage = function(evt) {
		var data = evt.data;
		switch (data.action) {
			case 'patch':
				patchQueue.running = false;
				if (data.success) {
					var realUrl = styles.isUserFile(data.file) ? styles.lookupBlobUrl(data.file) : data.file;

					styleCache[data.file] = data.result.source;
					suppressUpdate(realUrl);
					sourcePatched(data);
					styles.replaceContent(realUrl, data.result.source);
				} else {
					console.error(data.result);
				}

				_runPatching();
				break;
			case 'diff':
				diffQueue.running = false;
				
				if (data.success) {
					var result = data.result;
					styleCache[data.file] = result.source;

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
		pageSettings.get({url: utils.inspectedPageUrl()}, function(settings) {
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
			worker.postMessage({
				action: 'patch',
				file: p.url,
				source: styleCache[p.url],
				patches: p.patches
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

			styles.requestResourceContent(url, function(content) {
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

	/**
	 * Applies incoming editor updates to CSS source
	 * @param  {Object} data Updates payload
	 */
	function applyUpdate(data, settings) {
		var browserFile = data.browserFile;
		if (!browserFile || !(browserFile in styleCache)) {
			_.each(settings.assocs, function(v, k) {
				if (v == data.editorFile) {
					browserFile = k;
				}
			});
		}

		if (!browserFile || !(browserFile in styleCache)) {
			return console.error('No associated file found');
		}

		requestPatching(browserFile, data.patch);
	}

	function runSourcePatching(data) {
		pageSettings.get({url: utils.inspectedPageUrl()}, function(settings) {
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
		saveStyles();
		socket.connect();
	}

	////////////////////////////////////////////////////////////

	// handle resource change
	WebInspector.Resource.addEventListener(WebInspector.SourceCode.Event.ContentDidChange, function(evt) {
		var res = evt.target;
		if (res.url in suppressed) {
			delete suppressed[res.url];
			return;
		}

		if (!(res.url in styleCache) || !res.content) {
			console.log('No "%s" resource in styles cache', res.url);
			return;
		}

		pageSettings.get({url: utils.inspectedPageUrl()}, function(settings) {
			if (settings.enabled) {
				requestDiff(res.url);
			} else {
				styleCache[res.url] = content;
			}
		});
	});

	dispatcher
		.on('saveAssociations', function(data) {
			assocs = data;
		})
		.on('applyPatch', runSourcePatching)
		.on('start', function() {
			// add CSS style
			var link = document.createElement('link');
			link.setAttribute('rel', 'stylesheet');
			link.href = domain + 'panel.css';
			document.head.appendChild(link);
		});


	socket.on('message', function(msg) {
		switch (msg.action) {
			case 'update':
				runSourcePatching(msg.data);
				break;
		}
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