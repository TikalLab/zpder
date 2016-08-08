var config = require('config');
var request = require('request');
var _ = require('underscore');
var util = require('util');

module.exports = {
	getAPIHeaders: function(accessToken){
		return {
			Authorization: 'token ' + accessToken,
			Accept: 'application/vnd.github.v3+json',
			'User-Agent': config.get('app.name')
		};
	},
}