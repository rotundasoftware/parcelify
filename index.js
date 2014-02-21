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
        var ostream = b.bundle().pipe(through2());
        ostream.pause();
        
        outer.on('package', function (pkg) {
            var outdir = path.join(opts.dst, pkg.hash);
            var tmpfile = path.join(outdir, '.bundle_' + pkg.hash + '.js');
            var pending = 2, hash;
            
            mkdirp(outdir, function (err) {
                if (err) return outer.emit('error', err);
                
                var p = pkg.package;
                p.path = outdir;
                if (!p.cartero) p.cartero = {};
                console.log(pkg.files);
                
                var streams = packageWriter(p, pkg.files, outdir);
                console.log(streams);
                
                var h = crypto.createHash('sha1');
                ostream.pipe(h).pipe(concat(function (buf) {
                    hash = buf.toString('hex');
                    done();
                }));
                ostream.pipe(h);
                ostream.pipe(fs.createWriteStream(tmpfile))
                    .on('close', done)
                ;
                ostream.resume();
            });
            
            function done () {
                if (--pending === 0) return;
                var dstfile = path.join(outdir, 'bundle_' + hash + '.js');
                fs.rename(tmpfile, dstfile, function (err) {
                    if (err) outer.emit('error', err)
                    else outer.emit('bundle.js', dstfile)
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
    
    var outer = new EventEmitter;
    return outer;
};
