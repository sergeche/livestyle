/**
 * Panel view for extensions. Holds current connection status
 * and file associations
 */
define(['lodash', 'path', 'dispatcher'], function(_, path, dispatcher) {
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

	view.className = 'livestyle';

	var pluginActive = false;
	var editorId = null;
	var editorFiles = null;
	var browserFiles = null;

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

	function updateResources(browserFiles, editorFiles) {
		if (!browserFiles || !editorFiles) {
			return;
		}

		var w = buildEditorFilesWidget(editorFiles);
		var elem = getByClass('sources');

		elem.innerHTML = path.prettifyPaths(browserFiles).map(function(item) {
			var parts = item.name.split('?');
			return '<li class="sources__item">'
				+ '<span class="sources__browser" title="' + item.path + '">' + parts.shift() 
				+ (parts.length ? '<span class="sources__qs">?' + parts.join('?') + '</span>' : '')
				+ '</span> '
				+ '<i class="dirs"></i> '
				+ w
				+ '</li>';
		}).join('');

		guessAssociations();
	}

	/**
	 * Tries to automatically find best editor resource match for
	 * browser resource
	 */
	function guessAssociations() {
		_.each(view.getElementsByClassName('sources__item'), function(item) {
			var bwResource = getByClass('sources__browser', item).textContent.trim().split('?')[0];
			_.each(item.querySelectorAll('.sources__editor option'), function(opt) {
				if (opt.text == bwResource) {
					opt.selected = true;
				}
			});
		});

		saveAssociations();
	}

	/**
	 * Saves file associations
	 */
	function saveAssociations() {
		var assocs = {};

		_.each(view.querySelectorAll('.mappings .sources__item'), function(item) {
			var browserFile = getByClass('sources__browser', item).getAttribute('title');
			var editorFile  = getByClass('sources__editor', item).value;
			assocs[browserFile] = editorFile || null;
		});

		dispatcher.trigger('saveAssociations', assocs);
		return assocs;
	}

	dispatcher.on('enable', function() {
		document.body.classList.remove('livestyle_disabled');
		getByClass('livestyle-enabled').checked = true;
	});

	dispatcher.on('disable', function() {
		document.body.classList.add('livestyle_disabled');
		getByClass('livestyle-enabled').checked = false;
	});

	getByClass('livestyle-enabled').addEventListener('click', function(evt) {
		module.pluginActive = this.checked;
	}, false);

	getByClass('mappings').addEventListener('change', function(evt) {
		if (evt.target.classList.contains('sources__editor')) {
			saveAssociations();
		}
	}, false);

	view.querySelector('.socket__status .reload').addEventListener('click', function(evt) {
		dispatcher.trigger('socket:reload');
	}, false);

	return module = {
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
			pluginActive = state;
			dispatcher.trigger(state ? 'enable' : 'disable');
		},

		get socketActive() {
			return getByClass('socket').classList.contains('active');
		},

		set socketActive(state) {
			getByClass('socket').classList[state ? 'add' : 'remove']('active');
			dispatcher.trigger('socket:active', state);
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
		}
	};
});