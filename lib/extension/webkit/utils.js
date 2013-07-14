define(function() {
	return {
		mainFrame: function() {
			return WebInspector.frameResourceManager.mainFrame;
		},
		inspectedPageUrl: function() {
			return this.mainFrame().url;
		}
	}
});