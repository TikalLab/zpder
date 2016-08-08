var express = require('express');
var router = express.Router();
var config = require('config');
var request = require('request');
var util = require('util');
var _ = require('underscore');
var us = require('underscore.string');
var querystring = require('querystring');
var url = require('url');
var async = require('async');
var nl2br = require('nl2br');
var marked = require('marked');

var errorHandler = require('../app_modules/error');
var github = require('../app_modules/github');


router.get('/authorize', function(req, res, next) {
	var redirect;
	redirect = {
		protocol: 'https',
		host: 'github.com',
		pathname: '/login/oauth/authorize',
		query: {
			client_id: config.get('github.client_id'),
			redirect_uri: 'http://' + config.get('github.redirect_domain') + '/github/authorized',
			scope: 'repo,user'
		}
	}
	res.redirect(url.format(redirect));
});

router.get('/authorized', function(req, res, next) {
	
	async.waterfall([
	    // switch the code for access token             
		function(callback){
			var form = {
				client_id: config.get('github.client_id'),
				client_secret: config.get('github.client_secret'),
				code: req.query.code,
			}
			var headers = {
				Accept: 'application/json'
			}
			request.post('https://github.com/login/oauth/access_token',{form: form, headers: headers},function(error,response,body){
				if(error){
					callback(error);
				}else if(response.statusCode > 300){
					callback(response.statusCode + ' : ' + body);
				}else{
					var data = JSON.parse(body);
					var accessToken = data.access_token;
					callback(null,accessToken);
				}
			});
		},
		// get the github user record
		function(accessToken,callback){
			var headers = github.getAPIHeaders(accessToken,config.get('app.name'));
			request('https://api.github.com/user',{headers: headers},function(error,response,body){
				if(error){
					callback(error);
				}else if(response.statusCode > 300){
					callback(response.statusCode + ' : ' + body);
				}else{
					callback(null,accessToken,JSON.parse(body));
				}
			});
		},
		// get the email
		function(accessToken,githubUser,callback){
			var headers = github.getAPIHeaders(req.session.user.github.access_token,config.get('app.name'));
			request('https://api.github.com/user/emails',{headers: headers},function(error,response,body){
				if(error){
					callback(error);
				}else if(response.statusCode > 300){
					callback(response.statusCode + ' : ' + body);
				}else{
					var githubUserEmails = JSON.parse(body);
					var email = _.find(githubUserEmails,function(email){
						return email.primary;
					}).email;
					callback(null,accessToken,githubUser,email);
				}
			});
		},
		// insert/update the user record to db
		function(accessToken,githubUser,email,callback){
			var users = req.db.get('users');
			var github = {
				id: githubUser.id,
				username: githubUser.login,
				name: githubUser.name,
				url: githubUser.html_url,
				access_token: accessToken,
				avatar_url: githubUser.avatar_url
			}
			
			users.findAndModify({
				'github.id': githubUser.id
			},{
				$setOnInsert:{
					email: email,
					created_at: new Date()
				},
				$set: {
					github: github, 
				}
			},{
				upsert: true,
				new: true
			},function(err,user){
				callback(err,user)
			});
		}
	],function(err,user,avatar){
		if(err){
			errorHandler.error(req,res,next,err);
		}else{
			req.session.user = user;
			var next = req.session.afterReconnectGoTo;
			delete req.session.afterReconnectGoTo;
			if(!next){
				next = '/';
			}
			res.redirect(next);
		}
	});

});


module.exports = router;
