define(['lodash', 'chrome/storage'], function(_, storage) {
	var defaults = {
		'port': 54000,
		'apply_unsaved': true
	};

	return {
		get: function(callback) {
			storage.get('global', function(obj) {
				callback(_.defaults(obj || {}, defaults));
			});
		},

		save: function(data) {
			this.get(function(settings) {
				storage.set('global', _.extend(settings, data || {}));
			});
		}
	}
});