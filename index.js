var mapper = require('parcel-map');
var fs = require('fs');
var path = require('path');
var parcelMap = require('parcel-map');
var packageWriter = require('package-writer');
var match = require('minimatch');
var shasum = require('shasum');
var EventEmitter = require('events').EventEmitter;
var mkdirp = require('mkdirp');
var through2 = require('through2');
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var concat = require('concat-stream');

module.exports = function (b, opts) {
    mkdirp(opts.dst, function () {
        parcelMap(b, opts, function (err, map) {
            if (err) return output.emit('error', err);
            withMap(map);
        });
        var pendingIO = 0;
        var ostream = b.bundle().pipe(through2());
        ostream.pause();
        
        outer.on('package', function (pkg) {
            var outdir = path.join(opts.dst, pkg.hash);
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
            
            pendingIO ++;
            fs.mkdir(outdir, function (err) {
                if (err && err.code === 'EEXIST') {
                    // some other instance has created this directory
                    if (--pendingIO === 0) finish();
                    return;
                }
                if (err) return outer.emit('error', err);
                pendingIO += 4 - 1;
                
                var p = pkg.package;
                p.path = pkg.path;
                if (!p.cartero) p.cartero = {};
                
                var streams = packageWriter(p, pkg.files, outdir);
                var types = {};
                Object.keys(streams).forEach(function (key) {
                    pendingIO ++;
                    streams[key].on('end', function () {
                        if (--pendingIO === 0) finish();
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
                
                var hjs = crypto.createHash('sha1');
                ostream.pipe(hjs).pipe(concat(function (buf) {
                    hashjs = buf.toString('hex');
                    done();
                }));
                ostream.pipe(hjs);
                ostream.pipe(fs.createWriteStream(tmpjs)).on('close', done);
                
                var hcss = crypto.createHash('sha1');
                cssBundle.pipe(hcss).pipe(concat(function (buf) {
                    hashcss = buf.toString('hex');
                    done();
                }));
                cssBundle.pipe(fs.createWriteStream(tmpcss)).on('close', done);
                
                ostream.resume();
            });
            
            function done () {
                -- pendingIO;
                if (--pending !== 0) return;
                pendingIO += 2;
                
                var dstjs = path.join(outdir, 'bundle_' + hashjs + '.js');
                var dstcss = path.join(outdir, 'bundle_' + hashcss + '.css');
                
                fs.rename(tmpjs, dstjs, function (err) {
                    if (err) return outer.emit('error', err)
                    outer.emit('bundle.js', dstjs);
                    if (--pendingIO === 0) finish();
                });
                fs.rename(tmpcss, dstcss, function (err) {
                    if (err) return outer.emit('error', err)
                    outer.emit('bundle.css', dstcss);
                    if (--pendingIO === 0) finish();
                });
            }
        });
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
            
            outer.emit('package', pkg);
        });
    }
    
    function finish () { outer.emit('done') }
    var outer = new EventEmitter;
    return outer;
};
