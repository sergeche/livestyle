/**
 * Various methods for building lookups used for
 * faster perfomance and node resolving
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var selector = require('./selector');

	function ExtendItem(sel, listItem, processor) {
		this.sel = sel;
		this.listItem = listItem;
		this.node = listItem.node;
		this.processor = processor;
		this._selCache = null;
		this._selCacheKey = null;
	}

	ExtendItem.prototype = {
		extendWith: function() {
			var sel = _.last(this.listItem.path);
			// if we have cached value, validate it first
			if (this._selCache !== null && this._selCacheKey === sel) {
				return this._selCache;
			}

			this._selCacheKey = sel;

			if (this.processor) {
				sel = this.processor(sel);
			}

			this._selCache = selector.rules(sel, true);
			return this._selCache;
		}
	};

	function RuleItem(listItem, i) {
		this.listIx = i;
		this.listItem = listItem;
		this.node = listItem.node;
		this._ruleCache = null;
		this._ruleCacheKey = null;
	}

	RuleItem.prototype = {
		/**
		 * Returns parsed rules for given selector
		 * @return {Array
		 */
		rules: function() {
			var sel = _.last(this.listItem.path);
			// if we have parsed and cached item,
			// validate it first
			if (this._ruleCache !== null && sel === this._ruleCacheKey) {
				return this._ruleCache;
			}

			this._ruleCacheKey = sel;
			this._ruleCache = selector.rules(sel, true);
			return this._ruleCache;
		},

		/**
		 * Returns parsed path of current node
		 * @return {Array}
		 */
		path: function() {
			return this.listItem.path;
		}
	};

	return {
		/**
		 * Factory method that produces instance of `RuleItem`
		 * @param  {Object} item Node list item
		 * @param  {Number} i    Index of node item in list
		 * @return {RuleItem}
		 */
		ruleItem: function(item, i) {
			return new RuleItem(item, i);
		},

		/**
		 * Creates rules lookup from fiven node list
		 * @param  {Array} list List of tree nodes
		 * @return {Array}
		 */
		rulesLookup: function(list) {
			return list.map(this.ruleItem);
		},

		/**
		 * Creates lookup by node ID
		 * @param  {Array} list List of tree nodes
		 * @return {Object} Hash where key it tree item ID and value
		 * is tree item itself
		 */
		idLookup: function(list) {
			var lookup = {};
			list.forEach(function(item) {
				lookup[item.node.id] = item;
			});
			return lookup;
		},

		/**
		 * Factory method that produces instance of `ExtendItem`
		 * @param  {String} sel       Current node’s selector
		 * @param  {Object} listItem  Item in parsed tree node list
		 * @param  {Functions} processor Optional method to process selector
		 * when calling `extendWith()` method
		 * @return {ExtendItem}
		 */
		extendItem: function(sel, listItem, processor) {
			return new ExtendItem(sel, listItem, processor);
		}
	};
});