var manifest = require('../');
var browserify = require('browserify');

var opts = {
    keys: [ 'style' ],
    dir: __dirname + '/views'
};
manifest(opts, browserify, function (err, mfest) {
    console.log(mfest);
});
