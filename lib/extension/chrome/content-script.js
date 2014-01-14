require(['cssom'], function(cssom) {
	chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
		if (request.action == 'patch') {
			var data = request.data;
			console.log(data);
			console.profile('Get stylesheets');
			var stylesheet = cssom.stylesheets()[data.file];
			console.profileEnd('Get stylesheets');

			console.profile('Get list');
			var list = cssom.toList(stylesheet);
			console.profileEnd('Get list');

			// if (stylesheet && stylesheet.cssRules) {
			// 	cssom.patch(stylesheet, data.patches);
			// }
		}
	});
});