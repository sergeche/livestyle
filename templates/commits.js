(function() {
	var words = {
		'today': 'Сегодня',
		'yesterday': 'Вчера'
	};

	var months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

	function isSameDay(dt1, dt2) {
		return dt1.getDate() == dt2.getDate() && dt1.getMonth() == dt2.getMonth() && dt1.getFullYear() == dt2.getFullYear();
	}

	var xhr = new XMLHttpRequest();
	xhr.onload = function() {
		var today = new Date();
		var yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);

		var logs = xhr.responseText.split('\n\n\n');
		document.getElementById('updates').innerHTML = logs.map(function(item) {
			var parts = item.split('\n');
			var date = new Date(parts[0]);
			var dateStr = '';

			if (isSameDay(date, today)) {
				dateStr = words.today;
			} else if (isSameDay(today, yesterday)) {
				dateStr = words.yesterday;
			} else {
				dateStr = date.getDate() + ' ' + months[date.getMonth()];
				if (date.getFullYear() != today.getFullYear()) {
					dateStr += ' ' + date.getFullYear();
				}
			}

			return '<li><span class="date">' + dateStr + '</span> ' + parts[1] + '</li>'
		}).join('');
	};

	xhr.open('GET', 'commits.log', true);
	xhr.send(null);
})();