var crypto = require('crypto');
var config = require('config');

module.exports = {
	encode: function(userID){
		hmac = crypto.createHmac('sha1', config.get('app.unsubscribe_secret'));
		hmac.update(userID);
		var code = hmac.digest('hex');
		return code;
	},
	verify: function(userID,code){
		var calced = this.encode(userID);
		return calced==code;
	},
	canSend: function(user,emailType){
		var canSend = true;
		if('unsubscribes' in user && (emailType in user.unsubscribes || 'all' in user.unsubscribes)){
			canSend = false;
		}
		return canSend;
	}
}