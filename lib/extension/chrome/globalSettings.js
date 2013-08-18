define(['lodash'], function(_) {
	var defaults = {
		'port': 54000,
		'apply_unsaved': true
	};
	var storage = chrome.storage.local;

	return {
		get: function(callback) {
			storage.get('global', function(obj) {
				callback(_.defaults(obj['global'] || {}, defaults));
			});
		},

		save: function(data) {
			this.get(function(settings) {
				settings = _.extend(settings, data || {});
				storage.set({'global': settings}, function() {
					if (chrome.runtime.lastError) {
						console.log('Got error on globals save:', chrome.runtime.lastError);
					}
				});
			});
		}
	}
});