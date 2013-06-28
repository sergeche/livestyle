/**
 * Sublime Text backend
 */
define(['diff', 'patch'], function(diff, patch) {
	function json(data) {
		return typeof data == 'string' ? JSON.parse(data) : data;
	}

	return {
		diff: function(src1, src2) {
			var patches = diff.diff(src1, src2);
			return patches ? JSON.stringify(patches) : null;
		},

		condensePatches: function(p1, p2) {
			p1 = json(p1 || []);
			p2 = json(p2 || []);
			var out = patch.condense(p1.concat(p2));
			return out.length ? JSON.stringify(out) : null
		},

		patch: function(content, patches) {
			patches = json(patches || []);
			if (patches && patches.length) {
				return patch.patch(content, patches);
			}
		}
	};
});