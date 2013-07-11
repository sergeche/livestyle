/**
 * Panel view for extensions. Holds current connection status
 * and file associations
 */
define(['lodash', 'path', 'eventMixin'], function(_, path, eventMixin) {
	var view = document.createElement('div');
	view.innerHTML = '<div class="socket">'
		+ '<span class="socket__status active">Editor name</span>'
		+ '<span class="socket__status inactive">No active editor <i class="reload"></i></span>'
		+ '</div>'
		+ '<div class="livestyle-toggler">'
		+ '<input type="checkbox" name="enabled" class="livestyle-enabled" id="livestyle-enabled" /> '
		+ '<label for="livestyle-enabled">Enable LiveStyle for current page</label>'
		+ '</div>'
	
		+ '<div class="mappings">'
		+ '<h2>File mapping</h2>'
		+ '<p>Associate web page files (on the left) with editor files (on the right). Open more CSS files in editor to make them appear in drop-down menus.</p>'
		+ '<ul class="sources"></ul>'
		+ '</div>';

	view.className = 'livestyle livestyle_disabled';

	var pluginActive = false;
	var editorId = null;
	var editorFiles = null;
	var browserFiles = null;
	var assocs = null;

	var silenceChangeEvt = false;

	// current module back-reference
	var module = null;

	/**
	 * Returns single element with given class name
	 * @param  {String}  className 
	 * @param  {Element} context
	 * @return {Element}
	 */
	function getByClass(className, context) {
		return (context || view).getElementsByClassName(className)[0];
	}

	/**
	 * Saves file associations
	 */
	function saveAssociations() {
		var oldAssocs = JSON.stringify(assocs);
		assocs = {};

		_.each(view.querySelectorAll('.mappings .sources__item'), function(item) {
			var browserFile = getByClass('sources__browser', item).getAttribute('title');
			var editorFile  = getByClass('sources__editor', item).value;
			assocs[browserFile] = editorFile || null;
		});

		if (oldAssocs !== JSON.stringify(assocs)) {
			module.trigger('saveAssociations', assocs);
		}
		
		return assocs;
	}

	/**
	 * Creates clonable widget with given file list
	 * @param  {Array} files
	 * @return {Element}
	 */
	function buildEditorFilesWidget(files) {
		files = path.prettifyPaths(files);
		return '<select name="editor-file" class="sources__editor">'
			+ '<option value="">...</option>'
			+ files.map(function(item) {
				return '<option value="' + item.path + '">' + item.name + '</option>';
			})
			+ '</select>';
	}

	/**
	 * Updates list of file associations
	 * @param  {Array} browserFiles List of browser files
	 * @param  {Array} editorFiles  List of editor files
	 */
	function updateResources(browserFiles, editorFiles) {
		if (!browserFiles || !editorFiles) {
			return;
		}

		var w = buildEditorFilesWidget(editorFiles);
		var elem = getByClass('sources');
		var reInternal = /^livestyle:/i;
		var blobCount = 0;

		elem.innerHTML = path.prettifyPaths(browserFiles).map(function(item) {
			var isUserFile = reInternal.test(item.path);
			// var fileName = isUserFile ? 'user CSS ' + (++blobCount) : item.name;
			var parts = item.name.split('?');

			return '<li class="sources__item' + (isUserFile ? ' sources__item_user' : '') + '">'
				+ '<i class="remove"></i>'
				+ '<span class="sources__browser" title="' + item.path + '">' + parts.shift() 
				+ (parts.length ? '<span class="sources__qs">?' + parts.join('?') + '</span>' : '')
				+ '</span> '
				+ '<i class="dirs"></i> '
				+ w
				+ '</li>';
		}).join('');

		guessAssociations(assocs);
	}

	/**
	 * Tries to automatically find best editor resource match for
	 * browser resource
	 */
	function guessAssociations(hints) {
		hints = hints || {};
		silenceChangeEvt = true;

		_.each(view.getElementsByClassName('sources__item'), function(item) {
			var bw = getByClass('sources__browser', item);
			var browserFile = bw.getAttribute('title');
			var browserOptName = bw.textContent.trim().split('?')[0];
			var callback = (browserFile in hints)
				? function(opt) {
					if (opt.value == hints[browserFile])
						opt.selected = true;
				}
				: function(opt) {
					if (opt.text == browserOptName)
						opt.selected = true;
				}
			
			_.each(item.querySelectorAll('.sources__editor option'), callback);
		});

		silenceChangeEvt = false;
		saveAssociations();
	}

	function closest(elem, className) {
		while (elem) {
			if (elem.classList.contains(className)) {
				return elem;
			}

			elem = elem.parentNode;
		}
	}

	module = _.extend({
		/**
		 * Identifies currently connected editor
		 * @param  {Object} editor Editor info
		 */
		identifyEditor: function(editor) {
			if (!editor) {
				return;
			}

			var text = editor.title;
			if (editor.icon) {
				text = '<img src="' + editor.icon + '" alt="' + editor.title + '" class="socket__editor-icon" /> ' + text;
			}

			editorId = editor.id;
			view.querySelector('.socket__status.active').innerHTML = text;

			this.editorFiles = editor.files;
			this.socketActive = true;
		},

		get view() {
			return view;
		},

		get pluginActive() {
			return pluginActive;
		},

		set pluginActive(state) {
			if (pluginActive !== state) {
				pluginActive = state;
				this.trigger(state ? 'enable' : 'disable');
			}
		},

		get socketActive() {
			return getByClass('socket').classList.contains('active');
		},

		set socketActive(state) {
			getByClass('socket').classList[state ? 'add' : 'remove']('active');
			this.trigger('socket:active', state);
		},

		get editorFiles() {
			return editorFiles;
		},

		set editorFiles(files) {
			editorFiles = files;
			updateResources(browserFiles, editorFiles);
		},

		get browserFiles() {
			return browserFiles;
		},

		set browserFiles(files) {
			browserFiles = files;
			updateResources(browserFiles, editorFiles);
		},

		get assocs() {
			return _.clone(assocs);
		},

		set assocs(value) {
			assocs = _.clone(value);
			if (browserFiles) {
				guessAssociations(assocs);
			}
		},

		/**
		 * Returns associated browser file for given 
		 * editor one
		 * @param  {String} file
		 * @return {String}
		 */
		associatedFile: function(file) {
			var out = null;
			_.each(assocs, function(v, k) {
				if (v == file) {
					out = k;
				}
			});

			return out;
		}
	}, eventMixin);

	module.on('enable', function() {
		view.classList.remove('livestyle_disabled');
		getByClass('livestyle-enabled').checked = true;
	});

	module.on('disable', function() {
		view.classList.add('livestyle_disabled');
		getByClass('livestyle-enabled').checked = false;
	});

	getByClass('livestyle-enabled').addEventListener('click', function(evt) {
		module.pluginActive = this.checked;
	}, false);

	var mappings = getByClass('mappings');
	mappings.addEventListener('change', function(evt) {
		if (!silenceChangeEvt) {
			saveAssociations();
		}
	}, false);

	mappings.addEventListener('click', function(evt) {
		if (evt.target.classList.contains('remove')) {
			var parent = closest(evt.target, 'sources__item');
			if (parent) {
				var bw = getByClass('sources__browser', parent);
				module.trigger('removeFile', bw.title);
			}
		}
		if (!silenceChangeEvt) {
			saveAssociations();
		}
	}, false);

	view.querySelector('.socket__status .reload').addEventListener('click', function(evt) {
		module.trigger('socket:reload');
	}, false);

	return module;
});