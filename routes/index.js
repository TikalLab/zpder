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
var unsubscriber = require('../app_modules/unsubscriber');


router.get('/', function(req, res, next) {
	if(!req.session.user){
		render(req,res,'index/index',{})
	}else{
		res.redirect('/explore')
	}
});

router.get('/tos',function(req, res, next) {
		render(req,res,'index/tos',{

		})
})

router.get('/logout', function(req, res, next) {
	delete req.session.user;
	res.redirect('/')
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
					try{
						var dependencies = JSON.parse(atob(pkg.content)).dependencies;
						allPacakges = allPacakges.concat(_.keys(dependencies))
					}catch(e){
							// ignore
					}
				}
			})
			allPacakges = _.uniq(allPacakges);
			allPacakges.sort();
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

router.get('/unsubscribe/:email_type/:user_id/:code', function(req, res, next) {
	if(!unsubscriber.verify(req.params.user_id,req.params.code)){
		// now what?
	}else{
		var users = req.db.get('users');
		var updateSet = {};
		updateSet['unsubscribes.' + req.params.email_type] = true;
		users.update({_id: req.params.user_id},{$set:updateSet},function(err,ok){
			if(err){
				errorHandler.error(req,res,next,err);
			}else{
				render(req,res,'index/unsubscribed',{
					email_type: req.params.email_type
				})
			}
		})
	}
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
