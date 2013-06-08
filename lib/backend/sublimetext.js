/**
 * Sublime Text backend
 */
define(['sourcer', 'tree', 'locator'], function(sourcer, tree, locator) {
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

	return {
		/**
		 * Returns updated part of `content`, which 
		 * is identified by CSS payload
		 * @param  {String} content CSS file content
		 * @param  {Object} payload CSS update payload
		 * @return {String}
		 */
		updatedPart: function(content, payload) {
			if (typeof payload == 'string') {
				payload = JSON.parse(payload);
			}

			var update = sourcer.patchedRanges(content, payload.patch);
			if (update.length) {
				update.forEach(function(r) {
					r[2] = escape(r[2]);
				});
				return JSON.stringify(update);
			}
		},

		makePatch: function(payload) {
			if (typeof payload == 'string') {
				payload = JSON.parse(payload);
			}

			var cssTree = tree.build(payload.content);
			var section = locator.locateByPos(cssTree, payload.caret);
			if (section.type == 'property') {
				section = section.parent;
			}

			return JSON.stringify({
				action: 'update',
				data: {
					editorFile: payload.url,
					patch: {
						path: locator.createPath(section),
						properties: payload.added.concat(payload.updated).map(transformToken),
						removed: payload.removed && payload.removed.length
							? payload.removed.map(transformToken)
							: null
					}
				}
			});
		}
	};
});