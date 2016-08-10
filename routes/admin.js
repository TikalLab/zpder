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
var fs = require('fs')
var path = require('path')

var errorHandler = require('../app_modules/error');
var github = require('../app_modules/github');
var mailer = require('../app_modules/mailer');


router.get('/', function(req, res, next) {
	render(req,res,'index/index',{})
});

router.post('/maintain', function(req, res, next) {
	async.waterfall([
		// find all indexed packages from all users                 
		function(callback){
			var users = req.db.get('users');
			users.distinct('packages',function(err,packages){
console.log('recieved this distinct list of pkgs: %s',util.inspect(packages))				
				callback(err,packages)
			})
		},
		function(packages,callback){
			packages.sort()
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
			console.log('final err is: %s',err)
			res.sendStatus(500)
		}else{
			res.sendStatus(200)
		}
	})
});

router.post('/index-all-users', function(req, res, next) {
	async.waterfall([
		// find all indexed packages from all users                 
		function(callback){
			var users = req.db.get('users');
			users.find({},function(err,users){
				callback(err,users)
			})
		},
		function(users,callback){
			async.each(users,function(user,callback){
				indexUser(user,req.db,function(err,user){
					callback(err)
				})
			},function(err){
				callback(err)
			})
		},
	],function(err){
		if(err){
			console.log('final err is: %s',err)
			res.sendStatus(500)
		}else{
			res.sendStatus(200)
		}
	})
});

function indexUser(user,db,callback){
	async.waterfall([
 		function(callback){
 			github.getUserRepos(user.github.access_token,function(err,repos){
 				callback(err,repos)
 			})
 		},	                 
 		function(repos,callback){
 			var packages = [];
 			async.each(repos,function(repo,callback){
// 				github.getRepoPackage(user.github.access_token,repo.full_name,function(err,pkg){
// 					if(err){
// 						callback(err)
// 					}else{
// 						if(pkg){
// 							packages.push(pkg)
// 						}
// 						callback()
// 					}
// 				})
				github.getRepoPackages(user.github.access_token,repo.full_name,function(err,repoPackages){
					if(err){
						callback(err)
					}else{
						if(repoPackages){
							packages = packages.concat(repoPackages)
						}
						callback()
					}
				})
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
 			allPacakges.sort()
 			var users = db.get('users');
 			users.findAndModify({
 				_id: user._id
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
		callback(err,user)
 	})
	
}


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

	var packages = db.get('packages');

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
					console.log('version of %s is %s',pkg,version)
					callback(null,version)
				}
			})
		},
		function(version,callback){
			packages.findOne({name: pkg},function(err,pkgObj){
				callback(err,version,pkgObj)
			})
		},
		function(version,pkgObj,callback){
			if(pkgObj && version == pkgObj.version){
				callback(null,false,false)
			}else{
				var isNew = !pkgObj;
				packages.findAndModify({name: pkg},{$set:{version: version}},{new: true, upsert: true},function(err,pkgObj){
					callback(err,pkgObj,isNew)
				})
			}
		},
		function(pkgObj,isNew,callback){
			if(!pkgObj || isNew){
				callback()
			}else{
				notifyUsers(pkgObj,db,function(err){
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
			users.find({packages: pkg.name},function(err,users){
console.log('HERE1')				
				callback(err,users)
			})
		},
		function(users,callback){
console.log('HERE2')				
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
console.log('err in notifyUsers: %s',err)		
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
