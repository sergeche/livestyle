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
	socket
		.on('open', function() {
			$('.socket .socket__status')
				.removeClass('inactive')
				.addClass('active')
				.html('Active');
		})
		.on('close', function() {
			$('.socket .socket__status')
				.removeClass('active')
				.addClass('inactive')
				.html('Inctive');	
		})
		.on('message', function(msg) {
			
		})
		.connect();
});