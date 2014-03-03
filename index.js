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
            var assetsJson = { "script" : [], "style" : [] };
            var parcelDirectory = null;

            self.on('package', function(pkg) {
                if(pkg.isParcel) parcelDirectory = path.join(opts.dst, pkg.id); // make a note of where the top level parcel output dir is so we can write assets.json

                if (-- pending === 0) {
                    var assetsJsonPath = path.join(parcelDirectory, 'assets.json');
                    fs.writeFile(assetsJsonPath, JSON.stringify(assetsJson, null, 4), function(err) {
                        if (err) return self.emit('error', err);
                        else self.emit('done');
                    });
                }
            });

            keys.forEach(function (key) {
                dopackage(packages[key], assetsJson );
            });
        });
        ostream = b.bundle().pipe(through2());
    });
    return self;
    
    function dopackage (pkg, assetsJson) {
        var p = new Package(pkg);

        p.on('bundle.js', function(dstjs) {
            assetsJson.script.push(dstjs);
        });

        p.on('bundle.css', function(dstcss) {
            assetsJson.style.push(dstcss);
        });

        var ws = p.writeFiles(path.join(opts.dst, pkg.id), function (err) {
            if (err) return self.emit('error', err);

            self.emit('package', pkg);
        });

        pkg.isParcel = p.isParcelOf(b);
        if (pkg.isParcel) ostream.pipe(ws);
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
        if (pkg.package.view) {
            pkg.files.view = [].concat(pkg.package.view)
                .map(function (file) {
                    return path.resolve(pkg.path, file);
                })
            ;
        }
        
        pkg.assets.forEach(function (file) {
            props.forEach(function (prop) {
                pkg.files[prop] = [];
                
                var pattern = pkg.package[prop];
                if (pattern) {
                    var rel = path.relative(dir, file);
                    if (match(rel, pattern)) pkg.files[prop].push(file);
                }
            });
        });
        
        results[key] = pkg;
    });
    return results;
}
