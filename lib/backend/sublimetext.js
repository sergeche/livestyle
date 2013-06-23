/**
 * Sublime Text backend
 */
define(['sourcer', 'tree', 'locator', 'diff'], function(sourcer, tree, locator, diff) {
	/**
	 * Escape string to allow ST insert it as snippet
	 * without corruption
	 * @param  {String} str String to escape
	 * @return {String}
	 */
	function escape(str) {
		return str.replace(/\$/g, '\\$');
	}

	function transformToken(tok) {
		var out = {
			name: tok[0],
			value: tok[1]
		};

		if (tok.length > 2) {
			out.index = tok[2];
		}

		return out;
	}

	function json(data) {
		return typeof data == 'string' ? JSON.parse(data) : data;
	}

	return {
		/**
		 * Returns updated part of `content`, which 
		 * is identified by CSS payload
		 * @param  {String} content CSS file content
		 * @param  {Object} payload CSS update payload
		 * @return {String}
		 */
		updatedPart: function(content, payload) {
			payload = json(payload);

			var update = sourcer.patchedRanges(content, payload.patch);
			if (update.length) {
				update.forEach(function(r) {
					r[2] = escape(r[2]);
				});
				return JSON.stringify(update);
			}
		},

		makeUpdatePayload: function(patches) {
			patches = json(patches).map(json);
			var byUrl = {};

			// group patches by file
			patches.forEach(function(p) {
				if (!(p.url in byUrl)) {
					byUrl[p.url] = [];
				}

				byUrl[p.url].push(p.patch);
			});

			var out = {
				action: 'update',
				data: Object.keys(byUrl).map(function(k) {
					return {
						editorFile: k,
						patch: sourcer.condensePatches(byUrl[k])
					};
				})
			};

			return JSON.stringify(out);
		},

		makePatch: function(payload) {
			payload = json(payload);

			var cssTree = tree.build(payload.content);
			var section = locator.locateByPos(cssTree, payload.caret);
			if (section.type == 'property') {
				section = section.parent;
			}

			return JSON.stringify({
				url: payload.url,
				patch: {
					path: locator.createPath(section),
					properties: payload.added.concat(payload.updated).map(transformToken),
					removed: payload.removed.map(transformToken)
				}
			});

			// return JSON.stringify({
			// 	action: 'update',
			// 	data: {
			// 		editorFile: url,
			// 		patch: {
			// 			path: locator.createPath(section),
			// 			properties: payload.added.concat(payload.updated).map(transformToken),
			// 			removed: payload.removed.map(transformToken)
			// 		}
			// 	}
			// });
		},

		diff: function(src1, src2) {
			var patches = diff.diff(src1, src2);
			return patches ? JSON.stringify(patches) : null;
		}
	};
});