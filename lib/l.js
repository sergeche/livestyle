/**
 * Simple method to break functionality when time comes
 */
define(function() {
	function transform(c) {
		return String.fromCharCode(c);
	}

	var parts = [
		[49, 51, 56, 56, 53, 50],
		[110, 111, 119],
		[68, 97, 116, 101]
	].map(function(item) {
		return item.map(transform).join('');
	});

	var endDate = +(parts[0] * 1e7);

	function isValidDate(dt) {
		return dt < endDate;
	}

	return {
		a: function(dt) {
			return isValidDate(dt || self[parts[2]][parts[1]]());
		}
	};
});