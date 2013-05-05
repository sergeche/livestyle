'use strict';

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

chrome.devtools.inspectedWindow.onResourceContentCommitted.addListener(function(res, content) {
	console.log('Updated resource: %s, new length: %d',  res.url, content.length);
	if (res.url in styles) {
		var patch = diffMatchPatch.patch_make(styles[res.url], content);
		styles[res.url] = content;
		console.log('Patch:', patch);
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