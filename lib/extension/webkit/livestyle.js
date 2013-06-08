require(['lodash', 'sourcer', 'socket', 'dispatcher', 'webkit/panel', 'extension/panelView'], function(_, sourcer, socket, dispatcher, panel, panelView) {
	var styles = {};
	var assocs = null;
	var supressUpdate = false;
	function log(msg) {
		document.getElementById('my-demo').innerHTML += msg + '<br>';
	}

	/**
	 * Applies incoming editor updates to CSS source
	 * @param  {Object} data Updates payload
	 */
	function applyUpdates(data) {
		if (!panelView.pluginActive) {
			return;
		}

		var browserFile = data.browserFile;
		if (!browserFile || !(browserFile in styles)) {
			_.each(assocs, function(v, k) {
				if (v == data.editorFile) {
					browserFile = k;
				}
			});
		}

		if (!browserFile || !(browserFile in styles)) {
			return console.log('No associated file found');
		}

		CSSAgent.getAllStyleSheets(function(err, styleSheets) {
			if (err) return;
			_.each(styleSheets, function(info) {
				var url = info.sourceURL;
				if (url == browserFile) {
					var styleSheet = WebInspector.cssStyleManager.styleSheetForIdentifier(info.styleSheetId);
					styleSheet.requestContent(function(res) {
						var content = sourcer.applyPatch(res.content, data.patch);
						styles[url] = content;
						supressUpdate = true;
						WebInspector.branchManager.currentBranch.revisionForRepresentedObject(styleSheet).content = content;
					});
				}
			});
		});
	}

	function saveFiles() {
		CSSAgent.getAllStyleSheets(function(err, styleSheets) {
			styles = {};

			_.each(styleSheets, function(info) {
				var url = info.sourceURL;
				var styleSheet = WebInspector.cssStyleManager.styleSheetForIdentifier(info.styleSheetId);
				styleSheet.requestContent(function(res) {
					styles[url] = res.content;
				});
			});
		});
	}

	function setBrowserFiles() {
		CSSAgent.getAllStyleSheets(function(err, styleSheets) {
			if (err) {
				panelView.browserFiles = null;
				return;
			}

			panelView.browserFiles = _.pluck(styleSheets, 'sourceURL');
		});
	}

	// handle resource change
	WebInspector.Resource.addEventListener(WebInspector.SourceCode.Event.ContentDidChange, function(evt) {
		var res = evt.target;
		if (!res.content || !panelView.pluginActive) {
			return;
		}

		if (supressUpdate) {
			return supressUpdate = false;
		}
		
		var origContent = (styles[res.url] || res.originalRevision.content);
		if (assocs && res.url in assocs) {
			var patch;
			try {
				patch = sourcer.makePatch(origContent, res.content);
			} catch (e) {}

			if (patch) {
				socket.send({
					action: 'update',
					data: {
						browserFile: res.url,
						editorFile: assocs[res.url],
						patch: patch
					}
				});
			}

			styles[res.url] = res.content;
		}
	});

	WebInspector.Frame.addEventListener(WebInspector.Frame.Event.MainResourceDidChange, function() {
		saveFiles();
		setBrowserFiles();
		panelView.pluginActive = true;
	});

	dispatcher.on('saveAssociations', function(data) {
		assocs = data;
	});

	socket
		.on('open', function() {
			panelView.socketActive = true;
		})
		.on('close', function() {
			panelView.socketActive = false;
		})
		.on('message', function(msg) {
			switch (msg.action) {
				case 'id':
					panelView.identifyEditor(msg.data);
					break;
				case 'update':
					applyUpdates(msg.data);
					break;
			}
		})
		.connect();
});