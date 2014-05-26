/**
 * Simplified tree structure that holds resolved CSS sections
 * and references to origin (preprocessor) nodes
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var reTopmostSection = /@media|@supports/;

	function ResolvedNode(ref, state) {
		this.ref = ref;
		this.type = ref.type;
		this.name = ref.name();
		this.value = ref.type !== 'section' ? ref.value() : null;
		this.parent = null;
		this.children = [];
		this.state = state;
	}

	ResolvedNode.prototype = {
		addChild: function(child) {
			if (!(child instanceof ResolvedNode)) {
				child = new ResolvedNode(child);
			}
			child.parent = this;
			this.children.push(child);
			return child;
		},

		/**
		 * Creates a detached clone of current node
		 * @return {ResolvedNode}
		 */
		clone: function() {
			var node = new ResolvedNode(this.ref);
			node.type = this.type;
			node.name = this.name;
			node.value = this.value;
			return node;
		},

		/**
		 * Removes current node from its parent
		 */
		remove: function() {
			if (this.parent) {
				var ix = this.parent.children.indexOf(this);
				this.parent.children.splice(ix, 1);
				this.parent = null;
			}
		},

		root: function() {
			var node = this;
			while (node.parent) {
				node = node.parent;
			}

			return node;
		},

		/**
		 * Returns top-most node available for section insertion.
		 * It can be either root or `@media` section
		 * @return {ResolvedNode}
		 */
		top: function() {
			var node = this;
			while (node.parent) {
				if (reTopmostSection.test(node.name)) {
					break;
				}
				node = node.parent;
			}

			return node;
		},

		/**
		 * Returns list of all inner section nodes of current node.
		 * Each result item contains full path of node and node reference
		 * @return {Array}
		 */
		sectionList: function(out) {
			out = out || [];
			this.children.forEach(function(item) {
				if (item.type == 'section' || item.type == 'at-rule') { // not a root element or property
					var path = [item.name];
					var ctx = item.parent;
					while (ctx.parent) {
						path.unshift(ctx.name);
						ctx = ctx.parent;
					}

					out.push({
						path: path,
						node: item,
						name: item.name
					});
				}
				item.sectionList(out);
			});

			return out;
		},

		/**
		 * Returns all child nodes with `property` type
		 * @return {Array}
		 */
		properties: function() {
			return this.children.filter(function(item) {
				return item.type === 'property';
			});
		},

		toCSS: function(skipEmpty, indent) {
			indent = indent || '';
			if (this.type == 'property') {
				return indent + this.name + ': ' + this.value + ';';
			}

			if (skipEmpty && !this.children.length) {
				return;
			}

			var before = '', after = '';
			if (this.name) {
				before = indent + this.name + ' {\n' ;
				after = indent + '}';
				indent += '\t';
			}

			var out = before;
			this.children.forEach(function(item) {
				var str = item.toCSS(skipEmpty, indent);
				if (str) {
					out += str + '\n';
				}
			});
			out += after;

			return out;
		}
	};

	return ResolvedNode;
});