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
	function ResolvedNode(ref) {
		this.ref = ref;
		this.type = ref.type;
		this.name = null;
		this.value = null;
		this.parent = null;
		this.children = [];
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

		root: function() {
			var node = this;
			while (node.parent) {
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
				if (item.type == 'section') { // not a root element or property
					var path = [item.name()];
					var ctx = item.parent;
					while (ctx.parent) {
						path.unshift(ctx.name());
						ctx = ctx.parent;
					}

					out.push({
						path: path,
						node: item
					});
				}
				item.sectionList(out);
			});

			return out;
		},

		toCSS: function(indent) {
			indent = indent || '';
			if (this.type == 'property') {
				return indent + this.name + ': ' + this.value + ';';
			}

			var before = '', after = '';
			if (this.name) {
				before = indent + this.name + ' {\n' ;
				after = '}\n';
				indent += '\t';
			}

			var out = before;
			this.children.forEach(function(item) {
				out += item.toCSS(indent) + '\n';
			});
			out += after;

			return out;
		}
	};

	return ResolvedNode;
});