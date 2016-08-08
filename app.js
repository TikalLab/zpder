var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var config = require('config')

var partials = require('express-partials');
var session = require('express-session')
var MongoStore = require('connect-mongo')(session);


//mongo
var mongo = require('mongodb');
var monk = require('monk');
var mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/zpder';
var db = monk(mongoUri);

var index = require('./routes/index');
//var users = require('./routes/users');
//var admin = require('./routes/admin');
//var google = require('./routes/google');
var github = require('./routes/github');
//var admin = require('./routes/admin');

var app = express();

app.use(session({
	secret: config.get('app.cookie_secret'),
	resave: false,
	saveUninitialized: false,
	store: new MongoStore({
		url: mongoUri,
		autoReconnect: true
	})
}));

app.use(partials());


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json({
	verify: function(req, res, buf, encoding) {
		req.rawBody = buf.toString(encoding);
	}
}));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


app.use(function(req,res,next){
    req.db = db;
    next();
});


app.use('/', index);
//app.use('/', users);
//app.use('/admin', admin);
//app.use('/google', google);
app.use('/github', github);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


module.exports = app;
console.log('env is: ' + app.get('env'));

