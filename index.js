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
        
        self.on('package', onpkg);
        function onpkg (pkg) {
            if (!isParcel(pkg)) return;
            self.removeListener('package', onpkg);
            self._eachPackage(pkg, ostream);
        }
    });
    
    function isParcel (pkg) {
        console.log(pkg);
        return false;
    }
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
    
P.prototype._eachPackage = function (pkg, ostream) {
    var self = this;
    var outdir = path.join(self._opts.dst, pkg.hash);
    var tmpjs = path.join(outdir, '.bundle_' + pkg.hash + '.js');
    var tmpcss = path.join(outdir, '.bundle_' + pkg.hash + '.css');
    
    var pending = 4
    var hashjs, hashcss;
    
    var fileTypes = Object.keys(pkg.files).reduce(function (acc, key) {
        pkg.files[key].forEach(function (file) {
            acc[file] = key;
        });
        return acc;
    }, {});
    
    self._add(1);
    fs.mkdir(outdir, function (err) {
        if (err && err.code === 'EEXIST') {
            // some other instance has created this directory
            self._add(-1);
            return;
        }
        if (err) return self.emit('error', err);
        self._add(3);
        
        var p = pkg.package;
        p.path = pkg.path;
        if (!p.cartero) p.cartero = {};
        
        packageWriter(p, pkg.files, outdir, function (err, streams) {
            if (err) return self.emit('error', err)
            ostream.pipe(self._withStreams(streams));
            ostream.resume();
        });
    });
};
    
P.prototype._withStreams = function (streams) {
    var self = this;
    
    var types = {};
    Object.keys(streams).forEach(function (key) {
        self._add(1);
        streams[key].on('end', function () {
            self._add(-1);
        });
        
        var t = fileTypes[key];
        if (!types[t]) types[t] = {};
        types[t][key] = streams[key];
    });
    
    var cssBundle = through2();
    var cssPending = 0;
    
    Object.keys(types.style || {}).forEach(function (key) {
        cssPending ++;
        var stream = types.style[key];
        stream.on('end', function () {
            if (-- cssPending === 0) cssBundle.push(null);
        });
        stream.pipe(cssBundle, { end: false });
    });
    
    var jsBundle = through2();
    
    var hjs = crypto.createHash('sha1');
    jsBundle.pipe(hjs).pipe(concat(function (buf) {
        hashjs = buf.toString('hex');
        done();
    }));
    jsBundle.pipe(fs.createWriteStream(tmpjs)).on('close', done);
    
    var hcss = crypto.createHash('sha1');
    cssBundle.pipe(hcss).pipe(concat(function (buf) {
        hashcss = buf.toString('hex');
        done();
    }));
    cssBundle.pipe(fs.createWriteStream(tmpcss)).on('close', done);
    
    return jsBundle;
    
    function done () {
        self._add(-1);
        if (--pending !== 0) return;
        self._add(2);
        
        var dstjs = path.join(outdir, 'bundle_' + hashjs + '.js');
        var dstcss = path.join(outdir, 'bundle_' + hashcss + '.css');
        
        fs.rename(tmpjs, dstjs, function (err) {
            if (err) return self.emit('error', err)
            self.emit('bundle.js', dstjs);
            self._add(-1);
        });
        fs.rename(tmpcss, dstcss, function (err) {
            if (err) return self.emit('error', err)
            self.emit('bundle.css', dstcss);
            self._add(-1);
        });
    }
};
    
P.prototype._add = function (n) {
    this._pending += n;
    if (this._pending === 0) this.emit('done');
};
