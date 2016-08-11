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
var atob = require('atob')

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
//				github.getRepoPackage(req.session.user.github.access_token,repo.full_name,function(err,pkg){
//					if(err){
//						callback(err)
//					}else{
//						if(pkg){
//							packages.push(pkg)
//						}
//						callback()
//					}
//				})
				github.getRepoPackages(req.session.user.github.access_token,repo,function(err,repoPackages){
					if(err){
						callback(err)
					}else{
						if(repoPackages){
							packages = packages.concat(repoPackages)
						}
						callback()
					}
				})
//				github.searchRepoPackages(req.session.user.github.access_token,repo.full_name,function(err,repoPackages){
//					if(err){
//						callback(err)
//					}else{
//						if(repoPackages){
//							packages = packages.concat(repoPackages)
//						}
//						callback()
//					}
//				})
			},function(err){
				callback(err,packages)
			})
		},
		function(packages,callback){
			var allPacakges = [];
			_.each(packages,function(pkg){
				if('content' in pkg){
					var dependencies = JSON.parse(atob(pkg.content)).dependencies;
					allPacakges = allPacakges.concat(_.keys(dependencies))
				}
			})
			allPacakges = _.uniq(allPacakges);
			var users = req.db.get('users');
			users.findAndModify({
				_id: req.session.user._id
			},{
				$set: {packages: allPacakges}
			},{
				new: true
			},function(err,user){
				if(err){
					callback(err)
				}else{
					callback(err,user)
				}
			})
		}
	],function(err,user){
		if(err){
			errorHandler.error(req,res,next,err)
		}else{
			req.session.user = user
			
			// process what we got
			render(req,res,'index/explore',{
				packages: user.packages
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
