(function (root, factory) {
	if (typeof define === 'function' && define.amd) {
		define(factory);
	} else {
		root.emSelect = factory();
	}
}(this, function() {
	var sliceFn = Array.prototype.slice;
	var widgets = {};
	var widgetId = 0;
	

	/**
	 * Simple config options wrapper
	 * @param {Object} data Actual options
	 */
	function Options(data) {
		this.data = data || {};
	}

	/**
	 * Returns given option name. If it's not defined, 
	 * returns optional `defaultValue`
	 * @param  {String} name         Option name
	 * @param  {any} defaultValue Default value, if option doesn't exists
	 * @return {Object}
	 */
	Options.prototype.get = function(name, defaultValue) {
		return name in this.data 
			? this.data[name] 
			: defaultValue;
	};

	/**
	 * Invokes given method, if exists, with passed
	 * arguments
	 * @param  {String} methodName
	 */
	Options.prototype.invoke = function(methodName) {
		if (typeof this.data[methodName] == 'function') {
			return this.data[methodName].apply(this.data, sliceFn.call(arguments, 1));
		}
	};

	/**
	 * Creates element with given tag name
	 * @param  {String} name      Tag name
	 * @param  {String} className Element's classes
	 * @return {Element}
	 */
	function el(name, className) {
		var elem = document.createElement(name);
		if (className) {
			elem.className = className;
		}
		return elem;
	}

	/**
	 * Gets closest parent of given element with
	 * specified class name
	 * @param  {Element} elem
	 * @param  {String} className
	 * @return {Element}
	 */
	function closest(elem, className) {
		while (elem.parentNode) {
			if (elem.classList.contains(className)) {
				return elem;
			}
			elem = elem.parentNode;
		}
	}

	/**
	 * Sets attributes to given element.
	 * @param {Element} elem Designated element
	 * @param {Object} attrs Attributes hash. You can also pass
	 * string as attribute name and third argument as attribute 
	 * value
	 * @returns {Element}
	 */
	function setAttr(elem, attrs) {
		if (typeof attrs == 'string' && arguments.length > 2) {
			elem.setAttribute(attrs, arguments[2]);
		} else if (typeof attrs == 'object') {
			Object.keys(attrs).forEach(function(name) {
				elem.setAttribute(name, attrs[name]);
			});
		}

		return elem;
	}

	/**
	 * Returns widget ID for given object
	 * @param  {Object} obj Any element of widget ID
	 * @return {String}
	 */
	function getWid(obj) {
		return (typeof obj == 'string') ? obj : obj.getAttribute('data-widget-id');
	}

	/**
	 * Utility function to remove element from DOM tree
	 * @param {Element} elem
	 */
	function remove(elem) {
		if (elem && elem.parentNode) {
			elem.parentNode.removeChild(elem);
		}
	}

	/**
	 * Builds HTML options list for given &lt;select&gt; element
	 * @param  {Element} sel
	 * @return {Element}
	 */
	function buildOptions(elem) {
		var wid = getWid(elem);
		var sel = widgets[wid].select;
		var options = widgets[wid].options;
		var optList = el('ul', 'em-select__opt');
		widgets[wid].popup = optList;

		log('Build options');

		for (var i = 0, il = sel.options.length, item, label, opt; i < il; i++) {
			opt = sel.options[i];
			item = el('li', 'em-select__opt-item');
			setAttr(item, {
				'data-ix': i,
				'data-value': opt.value,
				'data-label': opt.label
			});

			if (sel.selectedIndex == i) {
				item.className += ' em-select__opt-item_selected';
			}

			label = el('span', 'em-select__opt-item-label');
			label.innerHTML = opt.label;

			item.appendChild(label);
			options.invoke('onItemCreate', item);
			optList.appendChild(item);
		}

		options.invoke('onItemListPopulate', optList);
		log('Build');
		return optList;
	}

	/**
	 * Shows emSelect popup for given &lt;select&gt; element
	 * @param  {Element} sel
	 */
	function showOptions(elem) {
		var wid = getWid(elem);
		var wData = widgets[wid];

		if (wData.widget.classList.contains('em-select_active')) {
			return;
		}

		wData.widget.classList.add('em-select_active');
		wData.widget.appendChild(buildOptions(wid));
		wData.options.invoke('onPopupShow', wid);
	}

	/**
	 * Hides emSelect popup for given source element
	 * @param {Element} elem
	 */
	function hideOptions(elem) {
		var wid = getWid(elem);
		var wData = widgets[wid];

		if (wData && wData.widget.classList.contains('em-select_active')) {
			wData.widget.classList.remove('em-select_active');
			if (wData.popup) {
				wData.options.invoke('onPopupHide', wid);
				remove(wData.popup);
				wData.popup = null;
			}
		}
	}

	/**
	 * Hides all active popups
	 */
	function hideAllOptions() {
		Object.keys(widgets).forEach(hideOptions);
	}

	document.addEventListener('click', function(evt) {
		var optItem = closest(evt.target, 'em-select__opt-item');
		if (optItem) {
			var container = closest(optItem, 'em-select');
			var wid = getWid(container);
			var handle = widgets[wid].options.invoke('onItemClick', optItem, wid, evt);
			if (handle !== false) {
				widgets[wid].select.value = optItem.getAttribute('data-value');

				// manually trigger `onchange` event
				var changeEvent = document.createEvent('HTMLEvents');
				changeEvent.initEvent('change', false, true);
				widgets[wid].select.dispatchEvent(changeEvent);

				hideOptions(wid);
			}
			return;
		}

		var optContainer = closest(evt.target, 'em-select');
		if (optContainer) {
			var wid = getWid(optContainer);
			if (widgets[wid].widget.classList.contains('em-select_active')) {
				hideOptions(wid);
			} else {
				showOptions(wid);
			}

			return;
		}

		hideAllOptions();
	}, false);

	/**
	 * Select widget constructor
	 * @param  {Element} elem    Original &lt;select&gt; element
	 * @param  {Object} options Constructor object
	 */
	var factory = function(elem, options) {
		var wid = 'em' + (++widgetId);
		options = new Options(options);
		
		var widget = el('span', 'em-select');
		var label = el('span', 'em-select__label');
		var labelText = options.get('label', '...');

		if (typeof elem.selectedIndex !== 'undefined') {
			labelText = elem.options[elem.selectedIndex].label;
		}

		label.innerHTML = labelText;
		widget.appendChild(label);

		setAttr(elem, 'data-widget-id', wid);
		setAttr(widget, 'data-widget-id', wid);

		elem.style.cssText += ';visibility:hidden;position:absolute;left:-2000px;';
		elem.addEventListener('change', function(evt) {
			label.innerHTML = elem.options[elem.selectedIndex].label;
		}, false);
		elem.parentNode.insertBefore(widget, elem);

		widgets[wid] = {
			select: elem, 
			widget: widget,
			options: options,
			popup: null
		};
	};

	factory.hide = hideOptions;
	factory.hideAll = hideAllOptions;
	factory.destory = function(elem) {
		var wid = getWid(elem);
		if (wid && wid in widgets) {
			remove(widgets[wid].widget);
			remove(widgets[wid].popup);
			delete widgets[wid];
		}

		if (elem.nodeType) {
			elem.removeAttribute('data-widget-id');
		}
	};
	factory.widgetData = function(elem) {
		var wid = getWid(elem);
		return widgets[wid];
	};

	return factory;
}));