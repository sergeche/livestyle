define(['lodash', 'extension/panelView'], function(_, panelView) {
	
	var lsBtn = new WebInspector.ActivateButtonToolbarItem('livestyle', 'Show Emmet LiveStyle', 'Emmet LiveStyle', 'Emmet LiveStyle', 'NavigationItemEmmet.pdf');
	lsBtn.addEventListener(WebInspector.ButtonNavigationItem.Event.Clicked, toggleLSView);
	lsBtn.enabled = true;

	var view = document.createElement('div');
	view.className = 'livestyle-webkit-view';
	view.appendChild(panelView.view);

	function toggleLSView() {
		if (!lsBtn.activated) {
			var bounds = lsBtn._element.getBoundingClientRect();
			view.style.left = (bounds.left - 15) + 'px';
			view.style.top = (bounds.bottom + 15) + 'px';
			document.body.appendChild(view);
			lsBtn.activated = true;
		} else {
			if (view.parentNode) {
				view.parentNode.removeChild(view);
			}

			lsBtn.activated = false;
		}
	}

	WebInspector.toolbar.addToolbarItem(lsBtn, WebInspector.Toolbar.Section.Left);




	// WebInspector.LiveStyleSidebarPanel = function () {
	// 	WebInspector.NavigationSidebarPanel.call(this, 'livestyle', 'Emmet LiveStyle', 'NavigationItemEmmet.pdf');
	// };
	
	// WebInspector.LiveStyleSidebarPanel.prototype = {
	// 	constructor: WebInspector.LiveStyleSidebarPanel,
	// 	shown: function () {
	// 		log('LiveStyle toggle');
	// 		WebInspector.NavigationSidebarPanel.prototype.shown.call(this);
	// 	}
	// };
	// WebInspector.LiveStyleSidebarPanel.prototype.__proto__ = WebInspector.NavigationSidebarPanel.prototype;


	// WebInspector.livestyleSidebarPanel = new WebInspector.LiveStyleSidebarPanel;
	// WebInspector.navigationSidebar.addSidebarPanel(WebInspector.livestyleSidebarPanel);
	// WebInspector.toolbar.addToolbarItem(WebInspector.livestyleSidebarPanel.toolbarItem, WebInspector.Toolbar.Section.Left);

	// if (this.contentBrowser.currentContentView !== this.consoleContentView) {
	// 	this.splitContentBrowser.contentViewContainer.closeAllContentViewsOfPrototype(WebInspector.LogContentView);
	// 	this.contentBrowser.showContentView(this.consoleContentView);
	// }

	return {
		activate: function() {
			
		}
	};
});