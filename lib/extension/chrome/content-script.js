require(['cssom'], function(cssom) {
	chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
		if (request.action == 'patch') {
			var data = request.data;
			var stylesheet = cssom.stylesheets()[data.file];
			if (stylesheet && stylesheet.cssRules) {
				cssom.patch(stylesheet, data.patches);
			}
		}
	});
});