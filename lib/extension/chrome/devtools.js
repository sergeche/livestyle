require.config({
	paths: {
		chrome: './',
		lodash: '../vendor/lodash'
	}
});

require(['lodash', 'tree', 'locator', 'socket', 'chrome/utils'], function(_, tree, locator, socket, utils) {
	var diffMatchPatch = new diff_match_patch();
	diffMatchPatch.Patch_Margin = 16;

	var editorId = null;
	var port = chrome.extension.connect({name: 'devtools'});
	var styles = {};
	/**
	 * Browser-to-editor associations
	 * @type {Object}
	 */
	var assocs = {};

	/**
	 * Compares old and new state of CSS file and returns updated CSS node,
	 * if any
	 * @param  {String} oldContent Previous CSS file state
	 * @param  {String} curContent Current CSS file state
	 * @return {CSSNode}
	 */
	function findUpdatedNode(oldContent, curContent) {
		var cssTree = tree.build(curContent);
		var patch = diffMatchPatch.patch_make(oldContent, curContent);
		if (cssTree && patch) {
			var updatePos = patch[0].start2 + patch[0].length2;
			var diffs = patch[0].diffs;

			// remove last, unchanged diffs
			while (_.last(diffs)[0] === 0) {
				updatePos -= diffs.pop()[1].length;
			}

			return  locator.locateByPos(cssTree, updatePos);
		}
	}

	chrome.devtools.inspectedWindow.getResources(function(resources) {
		styles = {};
		resources.forEach(function(item) {
			if (item.type == 'stylesheet') {
				item.getContent(function(content) {
					styles[item.url] = content;
				});
			}
		});
	});

	chrome.devtools.inspectedWindow.onResourceContentCommitted.addListener(function(res, content) {
		if (res.url in styles) {
			var node = findUpdatedNode(styles[res.url], content);
			if (node && node.type == 'property') {
				socket.send({
					action: 'browserUpdate',
					data: {
						file: assocs[res.url],
						path: locator.createPath(node),
						value: node.value()
					}
				});
			}

			styles[res.url] = content;
		}
	});

	chrome.devtools.network.onNavigated.addListener(function() {
		console.info('A page reloaded');
		styles = {};
	});


	// XXX init plugin
	port.onMessage.addListener(function(message) {
		switch (message.action) {
			case 'requestEditorId':
				utils.sendPortMessage(message.data.respondTo || 'all', 'editorId', editorId);
				break;
			case 'checkSocket':
				socket.check();
				break;
			case 'saveAssociations':
				console.log('Save assocs', message.data);
				assocs = message.data;
				break;
		}
	});
	
	socket
		.on('open', function() {
			utils.sendPortMessage('all', 'socketOpen');
		})
		.on('close', function() {
			utils.sendPortMessage('all', 'socketClose');
		})
		.on('message', function(msg) {
			switch (msg.action) {
				case 'id':
					editorId = msg.data;
					break;
			}
			utils.sendPortMessage('all', 'socketMessage', msg);
		})
		.connect();

	chrome.devtools.panels.create('Emmet LiveStyle', 'icon48.png', 'panel.html', function(panel) {		
		
	});
});