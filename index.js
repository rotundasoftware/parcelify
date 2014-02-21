var detect = require('parcel-detector');
var mapper = require('parcel-map');
var fs = require('fs');
var path = require('path');
var parcelMap = require('parcel-map');
var match = require('minimatch');
var shasum = require('shasum');
var EventEmitter = require('events').EventEmitter;
var mkdirp = require('mkdirp');
var path = require('path');
var fs = require('fs');

module.exports = function (b, opts, cb) {
    mkdirp(opts.dst, function () {
        parcelMap(b, opts, function (err, map) {
            if (err) return cb(err);
            withMap(map);
        });
        
        b.bundle();
        //b.bundle().pipe();
    });
    
    function withMap (map) {
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
            pkg.dependencies = map.dependencies[key] || {};
            
            pkg.assets.forEach(function (file) {
                props.forEach(function (prop) {
                    pkg.files[prop] = [];
                    
                    var pattern = pkg.package[prop];
                    var rel = path.relative(dir, file);
                    if (match(rel, pattern)) pkg.files[prop].push(file);
                });
            });
            
            console.log(map);
            outer.emit('package', pkg);
        });
    }
    
    var outer = new EventEmitter;
    return outer;
};
