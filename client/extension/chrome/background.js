chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	console.log('got request', console.log('notify', request));
	switch (request.action) {
		case 'notify':
			webkitNotifications.createNotification('icon48.png', request.title || 'Notification', request.message).show();
			break;
	}
});