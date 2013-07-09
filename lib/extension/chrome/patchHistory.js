define(['vendor/emSelect'], function(emSelect) {
	var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	var words = {
		today: 'Today',
		yesterday: 'Yesterday'
	};

	var blobs = {};

	var emSelectDelegate = {
		onItemListPopulate: function(elem) {
			// remove first option since it's a label
			var opt = elem.getElementsByClassName('em-select__opt-item')[0];
			opt.parentNode.removeChild(opt);
		},
		onItemCreate: function(item) {
			var key = item.getAttribute('data-value');
			if (!key) {
				return;
			}

			var dwBtn = el('a', {
				'class': 'patch-download',
				'href': blobs[key].url,
				'download': blobs[key].filename,
				'title': 'Download patch'
			});
			dwBtn.innerHTML = '&#11015;';
			item.appendChild(dwBtn);
		},
		onItemClick: function(item, wid, evt) {
			emSelect.hide(wid);
			return false;
		}
	};

	/**
	 * Utility function to create element with given name 
	 * class name
	 * @param  {String} name  Element name
	 * @param  {String} att   Element's class (string) or attributes hash (object)
	 * @return {Element}
	 */
	function el(name, attrs) {
		var elem = document.createElement(name);
		if (typeof attrs == 'string') {
			elem.className = attrs;
		} else if (typeof attrs == 'object') {
			Object.keys(attrs).forEach(function(k) {
				elem.setAttribute(k, attrs[k]);
			});
		}

		return elem;
	}

	function isSameDay(dt1, dt2) {
		return dt1.getDate() == dt2.getDate() && dt1.getMonth() == dt2.getMonth() && dt1.getFullYear() == dt2.getFullYear();
	}

	function pad(num) {
		return (num < 10 ? '0' : '') + num;
	}

	/**
	 * @param  {Number} dt 
	 * @return {String}
	 */
	function formatDate(dt) {
		dt = new Date(dt);
		var today = new Date();
		var yesterday = new Date();

		var prefix = '';
		if (isSameDay(dt, today)) {
			prefix = words.today;
		} else if (isSameDay(dt, yesterday)) {
			prefix = words.yesterday;
		} else {
			prefix = months[dt.getMonth()] + ' ' + dt.getDate();
			if (dt.getFullYear() != today.getFullYear()) {
				prefix += ', ' + dt.getFullYear();
			}
		}

		return prefix + ', ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
	}

	function formatDateForFile(dt) {
		dt = new Date(dt);
		return [dt.getFullYear(), pad(dt.getMonth() + 1), pad(dt.getDate()), pad(dt.getHours()), pad(dt.getMinutes())].join('-');
	}

	/**
	 * Transforms page settings into array of option values
	 * with `label` and `value` properties
	 * @param  {Object} settings Page settings
	 * @return {Array}
	 */
	function settingsToOpt(settings) {
		if (settings.meta.patchHistory) {
			return settings.meta.patchHistory
				.filter(function(item) {
					return !!Object.keys(item.styles).length;
				})
				.sort(function(a, b) {
					return b.date - a.date;
				})
				.map(function(item, i) {
					return {
						label: formatDate(item.date),
						value: i
					};
				});
		}

		return [];
	}

	/**
	 * Correcly resets patch blob container
	 */
	function emptyBlobs() {
		Object.keys(blobs).forEach(function(blob) {
			window.URL.revokeObjectURL(blob.url);
		});

		blobs = {};
	}

	/**
	 * Saves patches as internal blobs
	 * @param  {Object} settings Page settings
	 */
	function saveBlobs(settings) {
		emptyBlobs();
		if (settings.meta.patchHistory) {
			settings.meta.patchHistory
				.filter(function(item) {
					return !!Object.keys(item.styles).length;
				})
				.forEach(function(item, i) {
					var json = JSON.stringify(item.styles, null, '\t');
					var b = new Blob([json], {type: 'application/octet-stream'});
					blobs[i + ''] = {
						data: b,
						url: window.URL.createObjectURL(b),
						filename: 'patch-' + formatDateForFile(item.date) + '.json'
					};
				});
		}
	}

	/**
	 * Populates options for &lt;select&gt; list
	 * @param  {Element} sel
	 * @param {Array}   list List of options. Each option is object
	 * with `label` and `value` keys
	 */
	function populateSelect(sel, list) {
		sel.options.length = 0;

		// first option is label for emSelect widget
		sel.appendChild(el('option', {
			label: 'Patch history',
			value: ''
		}));

		list.forEach(function(item) {
			sel.appendChild(el('option', item));
		});
	}

	return {
		/**
		 * Init patch history module
		 * @param  {Object} settings Page settings
		 */
		init: function(settings) {
			var oldSel = document.querySelector('select[name="patch-history"]');
			if (oldSel) {
				oldSel.parentNode.removeChild(oldSel);
				emSelect.destory(oldSel);
			}

			var sel = el('select', {name: 'patch-history'});
			var wrap = el('span', 'patch-history__wrap');
			wrap.appendChild(sel);

			saveBlobs(settings);
			populateSelect(sel, settingsToOpt(settings));
			document.querySelector('.mappings h2').appendChild(wrap);
			emSelect(sel, emSelectDelegate);
		},
		update: function(settings) {
			saveBlobs(settings);
			populateSelect(document.querySelector('select[name="patch-history"]'), settingsToOpt(settings));
		}
	};
});