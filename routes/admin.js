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
var moment = require('moment')

var errorHandler = require('../app_modules/error');
var github = require('../app_modules/github');
var mailer = require('../app_modules/mailer');


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
				github.getRepoPackages(user.github.access_token,repo,function(err,repoPackages){
					if(err){
console.log('err is in repo: %s',repo.full_name)
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
					try{
						var dependencies = JSON.parse(atob(pkg.content)).dependencies;
	 					allPacakges = allPacakges.concat(_.keys(dependencies))
					}catch(e){
						// ignore
					}
 				}
 			})
 			allPacakges = _.uniq(allPacakges);
 			allPacakges.sort()
 			var users = db.get('users');
 			users.findOneAndUpdate({
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
					var repo;
					var repoUrl = $('.sidebar .box li:nth-child(3) a').html();
					if(repoUrl){
						var parts = repoUrl.split('/');
						repo = parts[parts.length - 2] + '/' + parts[parts.length - 1];
					}
					callback(null,version,repo)
				}
			})
		},
		function(version,repo,callback){
			packages.findOne({name: pkg},function(err,pkgObj){
				callback(err,version,repo,pkgObj)
			})
		},
		function(version,repo,pkgObj,callback){
			if(pkgObj && version == pkgObj.version){
				callback(null,repo,false,false)
			}else if(!version){
				callback(null,repo,false,false)
			}else if(!us.include(version,'.')){
				callback(null,repo,false,false)
			}else{
				var isNew = !pkgObj;
				packages.findOneAndUpdate({name: pkg},{$set:{version: version}},{new: true, upsert: true},function(err,pkgObj){
					callback(err,repo,pkgObj,isNew)
				})
			}
		},
		function(repo,pkgObj,isNew,callback){
			if(!pkgObj || isNew){
				callback()
			}else{
				notifyUsers(repo,pkgObj,db,function(err){
					callback(err)
				})
			}
		}
	],function(err){
		console.log('error in updatePackageVersion: %s',err);
		// callback(err)
		callback()
	})


}

var packageUpdatedTemplate = fs.readFileSync(path.join(__dirname,'../views/emails/package-updated.ejs'), 'utf8');

function notifyUsers(repo,pkg,db,callback){

	async.waterfall([
		function(callback){
			var users = db.get('users');
			users.find({packages: pkg.name},function(err,users){
				callback(err,users)
			})
		},
		// get the repo history
		function(users,callback){
			if(!repo){
				callback(null,users,null)
			}else{
				github.getChangeLogLink(users[0].github.access_token,repo,function(err,chnageLogLink){
					callback(err,users,chnageLogLink)
				})
			}
		},
		function(users,chnageLogLink,callback){
			mailer.sendMulti(
				users, //recipients
				'[' + config.get('app.name') + '] ' + pkg.name + ' has been updated',
				packageUpdatedTemplate,
				{
					pkg: pkg,
					change_log_link: chnageLogLink,
					repo: repo
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

var basicAuth = require('basic-auth');

var auth = function (req, res, next) {
	function unauthorized(res) {
		res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
		return res.sendStatus(401);
	};

	var user = basicAuth(req);

	if (!user || !user.name || !user.pass) {
		return unauthorized(res);
	};

	if (user.name === config.get('auth.username') && user.pass === config.get('auth.password')) {
		return next();
	}else{
		return unauthorized(res);
	};
};

router.get('/',auth,function(req, res, next) {
	render(req,res,'admin/index',{
		active_page: ''
	});
})

router.get('/users',auth,function(req, res, next) {
	var users = req.db.get('users');

	users.find({},function(err,docs){
		if(err){
			errorHandler.error(req,res,next,err)
		}else{
			render(req,res,'admin/users',{
				users: docs,
				active_page: 'users'
			})
		}
	})
});

router.get('/packages',auth,function(req, res, next) {
	var packages = req.db.get('packages');

	packages.find({},{sort:{name:1}},function(err,docs){
		if(err){
			errorHandler.error(req,res,next,err)
		}else{
			render(req,res,'admin/packages',{
				packages: docs,
				active_page: 'packages'
			})
		}
	})
});
function render(req,res,template,params){

	params.user = req.session.user;
	params.app = req.app;
	params.config = config;
	params.moment = moment;
	params._ = _;

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
