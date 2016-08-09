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
var cheerio = require('cheerio')

var errorHandler = require('../app_modules/error');
var github = require('../app_modules/github');


router.get('/', function(req, res, next) {
	render(req,res,'index/index',{})
});

router.post('/maintain', function(req, res, next) {
	async.waterfall([
		// find all indexed packages from all users                 
		function(callback){
			var users = req.db.get('users');
			users.distinct('packages',function(err,packages){
				callback(err,packages)
			})
		},
		function(packages,callback){
			async.each(packages,function(pkg,callback){
				updatePackageVersion(pkg,req.db,function(err){
					callback(err)
				})
			},function(err){
				callback(err)
			})
		},
	],function(err){
		if(err){
			
		}else{
			
		}
	})
});


function getPackageVersion(pkg,callback){
	request('https://www.npmjs.com/package/' + pkg,function(error,response,body){
		if(error){
			callback(error)
		}else if(response.statusCode > 300){
			callback(response.statusCode + ' : ' + body);
		}else{
			var $ = cheerio.load(body);
			var version = $('.sidebar .box li:nth-child(2) strong').html()
			console.log('version of %s is %s',pkg,version)
			callback(version)
		}
	})
}

function updatePackageVersion(pkg,db,callback){
	
	async.waterfall([
		function(callback){
			request('https://www.npmjs.com/package/' + pkg,function(error,response,body){
				if(error){
					callback(error)
				}else if(response.statusCode > 300){
					callback(response.statusCode + ' : ' + body);
				}else{
					var $ = cheerio.load(body);
					var version = $('.sidebar .box li:nth-child(2) strong').html()
//					console.log('version of %s is %s',pkg,version)
					callback(null,version)
				}
			})
		},
		function(version,callback){
			var packages = db.get('packages');
			pacakges.findOne({name: pkg},function(err,pkg){
				callback(err,version,pkg)
			})
		},
		function(version,pkg,callback){
			if(version == pkg.version){
				callback(null,false)
			}else{
				packages.findAndModify({_id: pkg._id.toString()},{$set:{version: version}},{new: true},function(err,pkg){
					callback(err,pkg)
				})
			}
		},
		function(pkg,callback){
			if(!pkg){
				callback()
			}else{
				notifyUsers(pkg,db,function(err){
					callback(err)
				})
			}
		}
	],function(err){
		callback(err)
	})
	
	
}

var packageUpdatedTemplate = fs.readFileSync(path.join(__dirname,'../views/emails/package-updated.ejs'), 'utf8');

function notifyUsers(pkg,db,callback){
	
	async.waterfall([
		function(callback){
			var users = db.get('users');
			users.find({packages:{$in: pkg.name}},function(err,users){
				callback(err,users)
			})
		},
		function(users,callback){
			mailer.sendMulti(
				users, //recipients
				'[' + config.get('app.name') + '] ' + pkg.name + ' has been updated',
				packageUpdatedTemplate,
				{
					pkg: pkg,
				},
				'package-updated-' + pkg.name,
				function(err){
					callback(err)
				}
				
			);
		}
	],function(err){
		callback(err)
	})
	
	
}

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
