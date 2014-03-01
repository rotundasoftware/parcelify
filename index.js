var fs = require('fs');
var path = require('path');
var parcelMap = require('parcel-map');
var match = require('minimatch');
var shasum = require('shasum');
var mkdirp = require('mkdirp');
var through2 = require('through2');
var path = require('path');

var fs = require('fs');
var EventEmitter = require('events').EventEmitter;
var Package = require('./lib/package.js');

module.exports = function (b, opts, cb) {
    var self = new EventEmitter;
    var ostream;
    if (cb) {
        self.on('error', cb);
        self.on('done', cb);
    }
    
    mkdirp(opts.dst, function () {
        parcelMap(b, opts, function (err, map) {
            if (err) return self.emit('error', err);
            self.emit('map', map);
            var packages = fixMap(map, opts);
            if (err) return self.emit('error', err);
            
            var keys = Object.keys(packages);
            var pending = keys.length;
            keys.forEach(function (key) {
                onpackage(packages[key], function (err) {
                    if (err) return self.emit('error', err);
                    if (-- pending === 0) self.emit('done');
                });
            });
        });
        ostream = b.bundle().pipe(through2());
    });
    return self;
    
    function onpackage (pkg, cb) {
        var p = new Package(pkg);
        var ws = p.writeFiles(path.join(opts.dst, pkg.id), function (err) {
            if (err) self.emit('error', err)
            else self.emit('done')
        });
        if (p.isParcelOf(b)) ostream.pipe(ws);
    }
};

function fixMap (map, opts) {
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
    
    var results = {};
    Object.keys(packages).forEach(function (key) {
        var pkg = packages[key];
        var dir = pkg.package.__dirname || opts.basedir || process.cwd();
        var props = opts.keys || [];
        pkg.id = key;
        pkg.files = {};
        pkg.path = dir;
        pkg.dependencies = map.dependencies[key] || [];
        
        pkg.assets.forEach(function (file) {
            props.forEach(function (prop) {
                pkg.files[prop] = [];
                
                var pattern = pkg.package[prop];
                var rel = path.relative(dir, file);
                if (match(rel, pattern)) pkg.files[prop].push(file);
            });
        });
        
        results[key] = pkg;
    });
    return results;
};
