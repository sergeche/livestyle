requirejs(['lodash', 'socket'], function(_, socket) {
	function updateResources() {
		chrome.devtools.inspectedWindow.getResources(function(resources) {
			var styles = _.filter(resources, function(item) {
				return item.type == 'stylesheet';
			});

			document.getElementById('styles').innerHTML = '<ul>'
			+ _.map(styles, function(res) {
				return '<li>' + res.url + '</li>';
			}).join('')
			+ '</ul>';
		});
	}

	updateResources();

	// socket UI
	var statusElem = $('.socket').on('click', '.reload', function() {
		socket.check();
	}).find('.socket__status');

	socket
		.on('open', function() {
			statusElem
				.removeClass('inactive')
				.addClass('active')
				.html('Active');
		})
		.on('close', function() {
			statusElem
				.removeClass('active')
				.addClass('inactive')
				.html('Inctive <i class="reload"></i>');
		})
		.on('message', function(msg) {
			console.log('got message', msg);
		})
		.connect();
});