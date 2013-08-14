/**
 * Sublime Text backend
 */
define(['diff', 'patch', 'tree', 'locator'], function(diff, patch, tree, locator) {
	function json(data) {
		return typeof data == 'string' ? JSON.parse(data) : data;
	}

	function formatError(err) {
		if (err && err.name == 'ParseError') {
			return err.message;
		}

		return err;
	}

	function patchAndDiff(content, patches, syntax) {
		var cssTree = tree.build(content);
		var clone = tree.fromJSONCache(cssTree.toJSONCache());
		var out;

		patches = json(patches || []);
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
					var item = locator.locate(section, [[prop.name, (prop.index || 0) + 1]]);

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

	return {
		diff: function(src1, src2, syntax) {
			var err = null, patches = null;
			try {
				patches = diff.diff(src1, src2, {syntax: syntax || 'css'});
			} catch(e) {
				err = e;
			}

			return JSON.stringify({
				status: err ? 'error' : 'ok',
				patches: patches,
				error: formatError(err)
			});
		},

		condensePatches: function(p1, p2) {
			p1 = json(p1 || []);
			p2 = json(p2 || []);
			var out = patch.condense(p1.concat(p2));
			return out.length ? JSON.stringify(out) : null
		},

		patch: function(content, patches, syntax) {
			patches = json(patches || []);
			if (patches && patches.length) {
				return patch.patch(content, patches, {syntax: syntax || 'css'});
			}
		},

		/**
		 * The same as `patch` method but also builds diff against original source.
		 * A bit slower, but provides additional hints for highlighting 
		 * changes in editor
		 * @param  {String} content Content to patch
		 * @param  {Array} patches Patches to apply
		 * @param  {String} syntax
		 * @return {Object}
		 */
		patchAndDiff: function(content, patches, syntax) {
			var out = null;
			try {
				out = patchAndDiff(content, patches, syntax);
				out.status = 'ok';
			} catch(e) {
				out = {
					status: 'error',
					error: formatError(e)
				};
			}

			return JSON.stringify(out);
		}
	};
});