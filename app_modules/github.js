var config = require('config');
var request = require('request');
var _ = require('underscore');
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
		var headers = this.getAPIHeaders(accessToken);
		
		async.waterfall([
			// get the master branch's sha...                 
			function(callback){
				request('https://api.github.com/repos/' + repo + '/git/refs/heads/master',{headers: headers},function(error,response,body){
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
			function(master,callback){
				
			}
		],function(err){
			
		})
		
		
	},
	getTreeRecursively: function(accessToken,repo,sha,callback){
		var thisObject = this;
		var headers = this.getAPIHeaders(accessToken);
		var items = [];
		aysnc.waterfall([
			function(callback){
				request('https://api.github.com/repos/' + repo + '/git/tress/' + sha,{headers: headers},function(error,response,body){
					if(error){
						callback(error);
					}else if(response.statusCode > 300){
						callback(response.statusCode + ' : ' + body);
					}else{
						var data = JSON.parse(body)
						callback(null,data.tree);
					}
				});	
			},
			function(tree,callback){
				async.each(tree,function(item,callback){
					if(item.type == 'tree'){
						thisObject.getTreeRecursively(accessToken, repo, item.sha, callback)
					}else{
						items.push(item);
						callback();
					}
				},function(err){
					
				})
			}
		],function(err){
			
		})
		
	}


}