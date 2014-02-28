var fs = require('fs');
var path = require('path');
var parcelMap = require('parcel-map');
var packageWriter = require('package-writer');
var match = require('minimatch');
var shasum = require('shasum');
var mkdirp = require('mkdirp');
var through2 = require('through2');
var path = require('path');
var crypto = require('crypto');
var concat = require('concat-stream');

var fs = require('fs');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var Package = require('./lib/package.js');

module.exports = P;
inherits(P, EventEmitter);

function P (b, opts) {
    var self = this;
    if (!(self instanceof P)) return new P(b, opts);
    EventEmitter.call(self);
    
    self._pending = 0;
    self._opts = opts;
    
    mkdirp(opts.dst, function () {
        parcelMap(b, opts, function (err, map) {
            if (err) return output.emit('error', err);
            self._withMap(map);
        });
        var ostream = b.bundle().pipe(through2());
        ostream.pause();
        
        self.on('package', function (pkg) {
            var p = new Package(pkg);
            if (p.isParcelOf(b)) {
                ostream.pipe(p);
            }
            p.writeFiles(path.join(opts.dst, pkg.hash), function (err) {
                if (err) self.emit('error', err);
            });
        });
    });
};

P.prototype._withMap = function (map) {
    var self = this;
    self.emit('map', map);
    
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
        var dir = pkg.package.__dirname || self._opts.basedir || process.cwd();
        var props = self._opts.keys || [];
        pkg.id = key;
        pkg.files = {};
        pkg.path = dir;
        pkg.dependencies = map.dependencies[key] || [];
        pkg.hash = shasum(dir + '!' + pkg.dependencies.join(','));
        
        pkg.assets.forEach(function (file) {
            props.forEach(function (prop) {
                pkg.files[prop] = [];
                
                var pattern = pkg.package[prop];
                var rel = path.relative(dir, file);
                if (match(rel, pattern)) pkg.files[prop].push(file);
            });
        });
        
        self.emit('package', pkg);
    });
};

P.prototype._add = function (n) {
    this._pending += n;
    if (this._pending === 0) this.emit('done');
};
