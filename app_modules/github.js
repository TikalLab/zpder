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
				request('https://api.github.com/user/repos?page=' + page,{headers: headers},function(error,response,body){
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
	}

}