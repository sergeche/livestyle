require.config({
	paths: {
		chrome: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'path', 'dispatcher', 'chrome/utils'], function(_, path, dispatcher, utils) {
	var enabled = true;
	var port = chrome.extension.connect({name: 'panel'});

	var fileAssociations = {
		editorId: null,
		files: {}
	};

	function isEnabled() {
		return enabled;
	}

	function toggleEnabled() {
		var state = arguments.length ? !!arguments[0] : !enabled;
		if (state !== enabled) {
			enabled = state;
			dispatcher.trigger(state ? 'enable' : 'disable');
		}
	}

	/**
	 * Creates clonable widget with given file list
	 * @param  {Array} files
	 * @return {Element}
	 */
	function buildEditorFilesWidget(files) {
		files = prettifyPathList(files);
		return '<select name="editor-file" class="sources__editor">'
			+ '<option value="">...</option>'
			+ files.map(function(item) {
				return '<option value="' + item.path + '">' + item.name + '</option>';
			})
			+ '</select>';
	}

	function updateResources(files) {
		var w = buildEditorFilesWidget(files);

		chrome.devtools.inspectedWindow.getResources(function(resources) {
			var items = resources.filter(function(item) {
				return item.type == 'stylesheet';
			});

			$('.sources').html(prettifyPathList(_.pluck(items, 'url')).map(function(item) {
				return '<li class="sources__item">'
					+ '<span class="sources__browser" title="' + item.path + '">' + item.name + '</span> '
					+ '<i class="dirs"></i> '
					+ w
					+ '</li>';
			}).join(''));

			guessAssociations();
		});
	}

	/**
	 * Tries to automatically find best editor resource match for
	 * browser resource
	 */
	function guessAssociations() {
		$('.sources__item').each(function(i, item) {
			var bResource = $(this).find('.sources__browser').text().trim();
			$(this).find('.sources__editor option').each(function() {
				if (this.text == bResource) {
					this.selected = true;
				}
			});
		});
		saveAssociations();
	}

	/**
	 * Returns given paths with prettified and shortened names
	 * @param  {Array} list List of paths
	 * @return {Array} List of objects with <code>name</code> and
	 * <code>path</code> properties
	 */
	function prettifyPathList(list) {
		var lookup = {};
		var storeItem = function(item) {
			if (!(item in lookup)) {
				lookup[item] = 0;
			}

			lookup[item]++;
			return item;
		};

		var isValid = function() {
			return !_.any(lookup, function(v) {
				return v > 1;
			});
		};

		var out = list.map(function(item) {
			return {
				name: storeItem(path.basename(item)),
				dir: path.dirname(item),
				path: item
			};
		});

		var shouldBreak = false;
		while (!isValid() && !shouldBreak) {
			lookup = {};
			out = out.map(function(item) {
				var name = path.join(path.basename(path.dir), item.name);
				if (name === item.name) {
					shouldBreak = true;
				}

				return {
					name: storeItem(name),
					dir: path.dirname(item.dir),
					path: item.path
				};
			});
		}

		return out;
	}

	/**
	 * Identifies currently connected editor
	 * @param  {Object} editor Editor info
	 */
	function identifyEditor(editor) {
		if (!editor) {
			return;
		}

		var text = editor.title;
		if (editor.icon) {
			text = '<img src="' + editor.icon + '" alt="' + editor.title + '" class="socket__editor-icon" /> ' + text;
		}

		fileAssociations.editorId = editor.id;
		$('.socket').addClass('active')
			.find('.socket__status.active').html(text);
		updateResources(editor.files);
	}

	/**
	 * Saves file associations
	 */
	function saveAssociations() {
		var assocs = {};

		$('.mappings .sources__item').each(function() {
			var browserFile = $(this).find('.sources__browser').attr('title');
			var editorFile = $(this).find('.sources__editor').val();
			assocs[browserFile] = editorFile || null;
		});

		utils.sendPortMessage('devtools', 'saveAssociations', assocs);
	}

	// activity state toggler
	function updateUIState() {
		var state = isEnabled();
		$(document.body).toggleClass('livestyle_disabled', !state);
		$('#livestyle-enabled')[0].checked = state;
	}

	function dispatchMessage(name, data, callback) {
		var args = _.toArray(arguments);
		if (_.isFunction(_.last(args))) {
			callback = _.last(args);
			args = _.initial(args);
		} else {
			callback = null;
		}

		var message = {
			name: args[0],
			data: args[1]
		};

		if (callback) {
			chrome.runtime.sendMessage(message, callback);
		} else {
			chrome.runtime.sendMessage(message);
		}
	}

	/**
	 * Handles incoming websocket message
	 * @param  {Object} message
	 */
	function handleSocketMessage(message) {
		switch (message.action) {
			case 'id':
				identifyEditor(message.data);
				break;
			case 'updateFiles':
				updateResources(message.data);
				break;
		}
	}

	updateUIState();

	dispatcher.on('enable disable', updateUIState);
	$('#livestyle-enabled').on('click', function() {
		toggleEnabled();
	});

	$('.mappings').on('change', '.sources__editor', saveAssociations);
	$('.socket__status .reload').click(function() {
		utils.sendPortMessage('devtools', 'checkSocket');
	});

	// update socket activity
	// dispatchMessage('requestEditorId', identifyEditor);
	port.onMessage.addListener(function(message) {
		switch (message.action) {
			case 'socketOpen':
				$('.socket').addClass('active');
				break;
			case 'socketClose':
				$('.socket').removeClass('active');
				break;
			case 'socketMessage':
				handleSocketMessage(message.data);
				break;
			case 'editorId':
				identifyEditor(message.data);
				break;
		}
	});

	utils.sendPortMessage('devtools', 'requestEditorId', {
		respondTo: port.name
	});
});