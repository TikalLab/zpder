var config = require('config');
var request = require('request');
var _ = require('underscore');
var us = require('underscore.string')
var util = require('util');
var async = require('async')
var parseLinkHeader = require('parse-link-header');

module.exports = {
	getAPIHeaders: function(accessToken){
		return {
			Authorization: 'token ' + accessToken,
			Accept: 'application/vnd.github.v3+json',
			'User-Agent': config.get('app.name')
		};
	},
	getUserRepos: function(accessToken,callback){
		var headers = this.getAPIHeaders(accessToken);
		var repos = [];
		var page = 1;
		var linkHeader;
		
		var qs = {
			affiliation: 'owner,collaborator'	
		}
		
		async.whilst(
			function(){
				return page;
			},
			function(callback){
				request('https://api.github.com/user/repos?page=' + page,{headers: headers, qs: qs},function(error,response,body){
					if(error){
						callback(error);
					}else if(response.statusCode > 300){
						callback(response.statusCode + ' : ' + body);
					}else{
						var data = JSON.parse(body)
						repos = repos.concat(data);
						linkHeader = parseLinkHeader(response.headers.link);
						page = (linkHeader? ('next' in linkHeader ? linkHeader.next.page : false) : false);
						callback(null,repos);
					}
				});	
			},
			function(err,repos){
				callback(err,repos)
			}
		);
	},
	// this gets a package.json in the root of the repo
	getRepoPackage: function(accessToken,repo,callback){
		var headers = this.getAPIHeaders(accessToken);
		request('https://api.github.com/repos/' + repo + '/contents/package.json',{headers: headers},function(error,response,body){
			if(error){
				callback(error);
			}else if(response.statusCode == 404){
				callback(null,null);
			}else if(response.statusCode > 300){
				callback(response.statusCode + ' : ' + body);
			}else{
				var data = JSON.parse(body)
console.log('package file for %s is: %s',repo,util.inspect(data))				
				callback(null,data);
			}
		});	
	},
	// this looks for all package.json files in the master branch, and ignores node_modules
	getRepoPackages: function(accessToken,repo,callback){
		var thisObject = this;
		var headers = this.getAPIHeaders(accessToken);
		
		async.waterfall([
			// get the master branch's sha...                 
			function(callback){
console.log('default branch for %s is %s',repo.full_name,repo.default_branch)				
//				request('https://api.github.com/repos/' + repo.full_name + '/git/refs/heads/' + repo.default_branch,{headers: headers},function(error,response,body){
				request('https://api.github.com/repos/' + repo.full_name + '/branches/' + repo.default_branch,{headers: headers},function(error,response,body){
					if(error){
						callback(error);
					}else if(response.statusCode > 300){
						callback(response.statusCode + ' : ' + body);
					}else{
						var master = JSON.parse(body)
//console.log('master of %s is: %s',repo,util.inspect(master))						
						callback(null,master);
					}
				});	
			},
			function(master,callback){
				thisObject.getTree(accessToken,repo,master.commit.sha,function(err,items){
					if(err){
						console.log('err is getTree for %s: %s',repo.full_name,err)
						callback(null,[])
					}else{
						callback(err,items)
					}
				})
			},
			function(items,callback){
				var packages = [];
				async.each(items,function(item,callback){
					if(!us.endsWith(item.path,'package.json') || us.include(item.path,'node_modules')){
						callback()
					}else{
						request(item.url,{headers: headers},function(error,response,body){
							if(error){
								callback(error);
							}else if(response.statusCode > 300){
								callback(response.statusCode + ' : ' + body);
							}else{
								var data = JSON.parse(body)
								packages.push(data);
								callback();
							}
						});	
					} 
				},function(err){
					callback(err,packages)
				})
			}
//			function(master,callback){
//				thisObject.getTreeRecursively(accessToken,repo,master.object.sha,function(err,items){
//					callback(err,items)
//				})
//			},
//			function(items,callback){
//				var packages = [];
//				async.each(items,function(item,callback){
//					if(item.path != 'package.json'){
//						callback()
//					}else{
//						request(item.url,{headers: headers},function(error,response,body){
//							if(error){
//								callback(error);
//							}else if(response.statusCode > 300){
//								callback(response.statusCode + ' : ' + body);
//							}else{
//								var data = JSON.parse(body)
//								packages.push(data);
//								callback();
//							}
//						});	
//					} 
//				},function(err){
//					callback(err,packages)
//				})
//			}
		],function(err,packages){
			callback(err,packages)
		})
		
		
	},
	getTreeRecursively: function(accessToken,repo,sha,callback){
		var thisObject = this;
		var headers = this.getAPIHeaders(accessToken);
		var items = [];
		async.waterfall([
			function(callback){
				request('https://api.github.com/repos/' + repo + '/git/trees/' + sha,{headers: headers},function(error,response,body){
					if(error){
						callback(error);
					}else if(response.statusCode > 300){
						callback(response.statusCode + ' : ' + body);
					}else{
						var data = JSON.parse(body)
console.log('tree for %s is: %s',sha,util.inspect(data.tree))						
						callback(null,data.tree);
					}
				});	
			},
			function(tree,callback){
				async.each(tree,function(item,callback){
					if(item.type == 'tree' && item.name != 'node_modules'){
						thisObject.getTreeRecursively(accessToken, repo, item.sha, function(err,newItems){
							if(err){
								callback(err)
							}else{
								items = items.concat(newItems)
								callback();
							}
						})
					}else{
						items.push(item);
						callback();
					}
				},function(err){
					callback(err)
				})
			}
		],function(err){
			callback(err,items)
		})
		
	},
	getTree: function(accessToken,repo,sha,callback){
		var thisObject = this;
		var headers = this.getAPIHeaders(accessToken);
		async.waterfall([
			function(callback){
				var qs = {
					recursive: '1'	
				}
				request('https://api.github.com/repos/' + repo.full_name + '/git/trees/' + sha,{headers: headers, qs: qs},function(error,response,body){
					if(error){
						callback(error);
					}else if(response.statusCode > 300){
						callback(response.statusCode + ' : ' + body);
					}else{
						var data = JSON.parse(body)
//console.log('tree for %s is: %s',sha,util.inspect(data.tree))						
						callback(null,data.tree);
					}
				});	
			},
		],function(err,items){
			callback(err,items)
		})
		
	},
	searchRepoPackages: function(accessToken,repo,callback){
		var headers = this.getAPIHeaders(accessToken);

		async.waterfall([
			function(callback){
				request('https://api.github.com/search/code?q=package.json+in:path+repo:' + repo,{headers: headers},function(error,response,body){
					if(error){
						callback(error);
					}else if(response.statusCode > 300){
						callback(response.statusCode + ' : ' + body);
					}else{
						var data = JSON.parse(body)
						callback(null,data);
					}
				});	
			}, 
			function(searchResults,callback){
				var packages = [];
				async.each(searchResults.items,function(item,callback){
					if(item.name != 'package.json'){
						callback()
					}else{
						request(item.url,{headers: headers},function(error,response,body){
							if(error){
								callback(error);
							}else if(response.statusCode > 300){
								callback(response.statusCode + ' : ' + body);
							}else{
								var data = JSON.parse(body)
console.log('found this package: %s',util.inspect(data))								
								packages.push(data);
								callback();
							}
						});	
					}
				},function(err){
					callback(err,packages)
				})
			}
		],function(err,packages){
			callback(err,packages)
		})
	},
	getChangeLogLink: function(accessToken,repo,callback){
		var headers = this.getAPIHeaders(accessToken);
		async.parallel([
			function(callback){
				request('https://api.github.com/search/code?q=chnagelog.md+in:path+repo:' + repo,{headers: headers},function(error,response,body){
					if(error){
						callback(error);
					}else if(response.statusCode > 300){
						callback(response.statusCode + ' : ' + body);
					}else{
						var data = JSON.parse(body)
						callback(null,data);
					}
				});		
			},
			function(callback){
				request('https://api.github.com/search/code?q=history.md+in:path+repo:' + repo,{headers: headers},function(error,response,body){
					if(error){
						callback(error);
					}else if(response.statusCode > 300){
						callback(response.statusCode + ' : ' + body);
					}else{
						var data = JSON.parse(body)
						callback(null,data);
					}
				});		
			},
		],function(err,results){
			if(err){
				callback(err)
			}else{
				if(results[0].items.length > 0){
					callback(null,results[0].items[0].html_url)
				}else if(results[1].items.length > 0){
					callback(null,results[0].items[0].html_url)
				}else{
					callback(null,null)
				}
			}
		})
	}


}