var copier = require('../');
var browserify = require('browserify');
var path = require('path');
var file = path.resolve(process.argv[2]);

var p = copier(browserify(file), {
    keys: [ 'style' ],
    dst: __dirname + '/dst'
});
p.on('package', console.log);
