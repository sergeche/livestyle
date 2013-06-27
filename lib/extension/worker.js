/**
 * A web worker implementation of source patching:
 * must be used as standalone HTML5 Web Worker to compute and 
 * apply diffs for CSS source
 */
require(['lodash', 'diff', 'patch'], function(_, diff, patch) {
	onmessage = function(evt) {
		switch (evt.data.action) {
			case 'diff':
				try {
					success(evt.data, {
						patches: diff.diff(evt.data.source1, evt.data.source2),
						source: evt.data.source2
					});
				} catch (e) {
					error(evt.data, e);
				}
				break;

			case 'patch':
				try {
					success(evt.data, patch.patch(evt.data.source, evt.data.patches));
				} catch (e) {
					error(evt.data, e);
				}
				break;
		}
	};

	function makePayload(evtData, success, result) {
		return {
			action: evtData.action,
			file: evtData.file,
			success: !!success,
			result: result
		};
	}

	function error(evtData, err) {
		postMessage(makePayload(evtData, false, err.message));
	}

	function success(evtData, result) {
		postMessage(makePayload(evtData, true, result));
	}
});