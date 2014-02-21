var detect = require('parcel-detector');
var mapper = require('parcel-map');
var fs = require('fs');
var path = require('path');
var parcelMap = require('parcel-map');
var match = require('minimatch');
var shasum = require('shasum');
var EventEmitter = require('events').EventEmitter;

module.exports = function (b, opts, cb) {
    parcelMap(b, opts, function (err, map) {
        if (err) return cb(err);
        outer.emit('map', map);
        
        var packages = {};
        Object.keys(map.packages).forEach(function (key) {
            packages[key] = {
                package: map.packages[key],
                assets: []
            };
        });
        Object.keys(map.assets).forEach(function (key) {
            var pkg = map.assets[key];
            packages[pkg].assets.push(key);
        });
        
        Object.keys(packages).forEach(function (key) {
            var pkg = packages[key];
            var dir = pkg.package.__dirname || opts.basedir || process.cwd();
            var props = opts.keys || [];
            var files = {};
            
            pkg.assets.forEach(function (file) {
                props.forEach(function (prop) {
                    files[prop] = [];
                    
                    var pattern = pkg.package[prop];
                    var rel = path.relative(dir, file);
                    if (match(rel, pattern)) files[prop].push(file);
                });
            });
            
            console.log(files);
        });
    });
    
    var outer = new EventEmitter;
    b.bundle();
    return outer;
};
