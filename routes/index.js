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


router.get('/', function(req, res, next) {
	render(req,res,'index/index',{})
});

router.get('/explore', function(req, res, next) {
	async.waterfall([
		function(callback){
			github.getUserRepos(req.session.user.github.access_token,function(err,repos){
				callback(err,repos)
			})
		},	                 
		function(repos,callback){
			var packages = [];
			async.each(repos,function(repo,callback){
				github.getRepoPackage(req.session.user.github.access_token,repo.full_name,function(err,pkg){
					if(err){
						callback(err)
					}else{
						packages.push(pkg)
						callback()
					}
				})
			},function(err){
				callback(err,packages)
			})
		},
	],function(err,packages){
		if(err){
			errorHandler.error(req,res,next,err)
		}else{
			render(req,res,'index/explore',{
				packages: packages
			})
		}
	})
	
});

function render(req,res,template,params){
	
	params.user = req.session.user;
	params.app = req.app;
	params.config = config;
	
	if(!('isHomepage' in params)){
		params.isHomepage = false;
	}
	
	if(!('isDevelopersHomepage' in params)){
		params.isDevelopersHomepage = false;
	}
	
	if(!('isOpenSourceHomepage' in params)){
		params.isOpenSourceHomepage = false;
	}
	
	if(!('isOrgsHomepage' in params)){
		params.isOrgsHomepage = false;
	}
	
	
	res.render(template,params);
}

module.exports = router;
