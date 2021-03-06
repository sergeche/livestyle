/**
 * A web worker implementation of source patching:
 * must be used as standalone HTML5 Web Worker to compute and 
 * apply diffs for CSS source
 */
require(['lodash', 'diff', 'patch', 'tree', 'locator'], function(_, diff, patch, tree, locator) {
	onmessage = function(evt) {
		var data = evt.data;
		switch (data.action) {
			case 'diff':
			case 'diffExternalSources':
				try {
					success(data, {
						patches: diff.diff(data.source1, data.source2, {syntax: data.syntax || 'css'}),
						source: data.source2
					});
				} catch (e) {
					error(data, e);
				}
				break;

			case 'patch':
				try {
					success(data, {
						patches: data.patches,
						source: patch.patch(data.source, data.patches)
					});
				} catch (e) {
					error(data, e);
				}
				break;
			
			case 'patchExternalSource':
				try {
					var out = patchAndDiff(data.source, data.patches, {syntax: data.syntax || 'css'});
					success(data, {
						patches: data.patches,
						content: out.content,
						selection: out.selection
					});
				} catch (e) {
					error(data, e);
				}
				break;

			case 'diffUnsaved':
				var out = [];
				_.each(data.data.files, function(item) {
					try {
						out.push({
							file: item.file,
							patches: diff.diff(item.pristine, item.content, {syntax: item.syntax || 'css'})
						});
					} catch (e) {
						log('Error while diff\'ing unsaved "' + item.file + '": ' + e);
					}
				});

				success(data, {files: out});
				break;
		}
	};

	function log(message) {
		postMessage({action: 'log', message: message});
	}

	function patchAndDiff(content, patches, syntax) {
		var cssTree = tree.build(content);
		var clone = tree.fromJSONCache(cssTree.toJSONCache());
		var out;

		if (patches && patches.length) {
			out = patch.patch(cssTree, patches, {syntax: syntax || 'css'});
		}

		if (!out) {
			return;
		}

		var hints = diff.diff(clone, cssTree);
		var sel = null, err = '';
		
		for (var i = 0, il = hints.length, h; i < il; i++) {
			h = hints[i];
			if (h.action == 'remove') {
				continue;
			}

			var section = locator.locate(cssTree, h.path);
			if (section) {
				if (h.properties.length) {
					var prop = h.properties[0];
					var item = locator.locate(section, prop.name);

					if (item) {
						sel = item.valueRange.toArray();
						if (item.rawValue().match(/^(\s+)/)) {
							sel[0] += RegExp.$1.length;
						}

						break;
					}
				}

				sel = [section.nameRange.start, section.nameRange.start];
				break;
			}
		}

		return {
			content: out,
			selection: sel
		};
	}

	function makePayload(evtData, success, result) {
		return {
			action: evtData.action,
			respondTo: evtData.respondTo,
			file: evtData.file,
			success: !!success,
			result: result
		};
	}

	function error(evtData, err) {
		var message = err && _.isObject(err) ? err.message : err;
		postMessage(makePayload(evtData, false, message));
	}

	function success(evtData, result) {
		// if (!l.a()) {
		// 	return error(evtData, {message: 'Beta expired'});
		// }

		postMessage(makePayload(evtData, true, result));
	}
});