var copier = require('../');
var browserify = require('browserify');
var path = require('path');
var file = path.resolve(process.argv[2]);

copier(browserify(file), {
    keys: [ 'style' ],
    dst: __dirname + '/dst'
});
