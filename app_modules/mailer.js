var ejs = require('ejs');
var fs = require('fs');
var config = require('config');

var request = require('request');
var moment = require('moment');
var crypto = require('crypto');
var path = require('path');
var async = require('async');
//var marked = require('marked');
//var htmlToText = require('html-to-text');

var unsubscriber = require('../app_modules/unsubscriber');




module.exports = {
	sendMulti: function(recipients,subject,template,params,emailType,callback){

console.log('HERE')		
		
		// add some common stuff to params
		params.config = config;
		params.email_type = emailType;
		var body = ejs.render(template,params);

		
		var batchSets = [];
		var to = [];
		var recipientVariables = {};
		var cnt = 0;
		recipients.forEach(function(recipient){
			
			if(unsubscriber.canSend(recipient,emailType)){
				if(cnt < 999){ // mailgun limit is 1000 recipients at once
					cnt++;
				}else{
					batchSets.push({
						to: to,
						recipientVariables: recipientVariables
					});
					to = [];
					recipientVariables = {};
					cnt = 0;
				}
				to.push(recipient.email);
				recipientVariables[recipient.email] = {
//					"name": recipient.github.username,
					"name": recipient.github.username,
					"id" : recipient._id.toString(),
					"code": unsubscriber.encode(recipient._id.toString())
				}
				
			}
			
			
		});
		// add the remaining
		if(to.length > 0){
			batchSets.push({
				to: to,
				recipientVariables: recipientVariables
			});
		}
		
		
	//console.log('batchSets is: %s',util.inspect(batchSets));
		async.each(batchSets,function(batchSet,callback){
			var options = {
				url: 'https://api.mailgun.net/v2/' + config.get('mailgun.domain') + '/messages',
				auth:{
					username: 'api',
					password: config.get('mailgun.api_key'),
					sendImmediately: false
				},
				form: {
					from: config.get('app.name') + ' <' + config.get('app.email') + '>',
					to: batchSet.to,
					'recipient-variables': JSON.stringify(batchSet.recipientVariables),
					subject: subject,
//					text: body,
					html: body
				},
				
			};
			
			request.post(options,function(error, response, body){
				if(error){
					callback(error);
				}else if(response.statusCode != 200){
					callback(body);
				}else{
					callback(null);
				}
			});
		},function(err){
			callback(err);
		});	
		
	}
}

