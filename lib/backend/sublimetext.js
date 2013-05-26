/**
 * Sublime Text backend
 */
define(['sourcer'], function(sourcer) {
	/**
	 * Escape string to allow ST insert it as snippet
	 * without corruption
	 * @param  {String} str String to escape
	 * @return {String}
	 */
	function escape(str) {
		return str.replace(/\$/g, '\\$');
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
			var update = sourcer.update(content, payload);
			if (update) {
				update.value = escape(update.value);
				return JSON.stringify(update);
			}
		},

		findUpdated: function(fileName, content, caret) {
			var out = sourcer.findUpdated(content, caret);
			if (out) {
				return JSON.stringify({
					action: 'editorUpdated',
					data: {
						url: fileName,
						updates: out
					}
				});
			}

			return null;
		}
	};
});