var detect = require('parcel-detector');
var mapper = require('parcel-map');
var fs = require('fs');
var path = require('path');
var parcelMap = require('parcel-map');
var match = require('minimatch');
var shasum = require('shasum');
var EventEmitter = require('events').EventEmitter;
var mkdirp = require('mkdirp');

module.exports = function (b, opts, cb) {
    var pending = 2, map;
    mkdirp(opts.dst, function () {
        if (-- pending === 0) fromMap(map);
    });
    
    parcelMap(b, opts, function (err, map_) {
        if (err) return cb(err);
        map = map_;
        if (-- pending === 0) fromMap(map);
    });
    
    function fromMap (map) {
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
            pkg.files = {};
            
            pkg.assets.forEach(function (file) {
                props.forEach(function (prop) {
                    pkg.files[prop] = [];
                    
                    var pattern = pkg.package[prop];
                    var rel = path.relative(dir, file);
                    if (match(rel, pattern)) pkg.files[prop].push(file);
                });
            });
            
            outer.emit('package', pkg);
        });
    }
    
    var outer = new EventEmitter;
    b.bundle();
    return outer;
};
