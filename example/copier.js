var copier = require('../');
var browserify = require('browserify');
var path = require('path');
var file = path.resolve(process.argv[2]);

var opts = {
    keys: [ 'style' ],
    dst: __dirname + '/dst'
};
var cp = copier(browserify(file), opts);
cp.on('done', function () {
    console.log('done!');
});
