'use strict';
requirejs(['lodash', 'tree', 'locator'], function(_, tree, locator) {
	var diffMatchPatch;
	var styles = {};

	/**
	 * @param {Function} onload
	 */
	function loadDiffMatchPatch(onload) {
		console.info('Loading diff_match_patch.js');
		var script = document.createElement('script');
		script.src = 'diff_match_patch.js';
		script.onload = function() {
			diffMatchPatch = new diff_match_patch();
			diffMatchPatch.Patch_Margin = 16;
			console.info('diff_match_patch.js loaded');
			// onload && onload();
		};
		document.head.appendChild(script);
	}

	/**
	 * Stores all styles content
	 */
	function storeStyles() {
		chrome.devtools.inspectedWindow.getResources(function(resources) {
			resources.forEach(function(res) {
				if (res.type == 'stylesheet') {
					res.getContent(function(content) {
						styles[res.url] = content;
					});
				}
			});
		});
	}

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

			var node = locator.locateByPos(cssTree, updatePos);
			if (node && node.type == 'property') {
				chrome.runtime.sendMessage({
					action: 'notify',
					title: 'CSS Updated',
					message: locator.createPath(node) + ' / ' + node.value()
				});
			}
		}
	}

	chrome.devtools.inspectedWindow.onResourceContentCommitted.addListener(function(res, content) {
		if (res.url in styles) {
			var node = findUpdatedNode(styles[res.url], content);
			if (node && node.type == 'property') {
				chrome.runtime.sendMessage({
					action: 'notify',
					title: 'CSS Updated',
					message: locator.createPath(node) + ' / ' + node.value()
				});
			}
			styles[res.url] = content;
		}
	});

	chrome.devtools.network.onNavigated.addListener(function() {
		console.info('A page reloaded');
		styles = {};
		storeStyles();
	});


	// XXX init plugin
	loadDiffMatchPatch();
	storeStyles();

	chrome.devtools.panels.create('Emmet LiveStyle', 'icon48.png', 'panel.html', function(panel) {
		panel.onShown.addListener(function(action) {
			console.log('Panel selected');
		});
	});
});