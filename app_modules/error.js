module.exports = {
	error: function(req,res,next,error){
		res.render('err',{error: error});
	}	
}