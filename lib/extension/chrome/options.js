require.config({
	paths: {
		chrome: './',
		lodash: '../vendor/lodash'
	}
});

require(['chrome/globalSettings'], function(globals) {
	function loadData() {
		globals.get(function(settings) {
			console.log('Got settings', settings);
			Object.keys(settings).forEach(function(k) {
				var fld = document.getElementById('fld-' + k);
				if (!fld) {
					return;
				}

				if (fld.type == 'checkbox') {
					fld.checked = !!settings[k];
				} else {
					fld.value = settings[k];
				}
			});
		});
	}

	function storeData(evt) {
		evt.preventDefault();
		var fields = document.getElementsByTagName('input');
		var payload = {};
		for (var i = fields.length - 1, f, val; i >= 0; i--) {
			f = fields[i];
			if (!f.name) {
				continue;
			}

			val = f.value;

			if (f.type == 'number') {
				val = parseInt(val, 10);
				if (isNaN(val)) {
					continue;
				}
			} else if (f.type == 'checkbox') {
				val = f.checked;
			}

			payload[f.name] = val;
		}

		globals.save(payload);
	}

	loadData();
	document.getElementsByTagName('form')[0].addEventListener('submit', storeData, false);
});
