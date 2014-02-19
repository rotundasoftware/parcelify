var detect = require('parcel-detector');
var mapper = require('parcel-map');
var fs = require('fs');
var path = require('path');
var parcelMap = require('parcel-map');

module.exports = function (opts, bundler, cb) {
    detect(opts.dir, function (err, detected) {
        if (err) return cb(err);
        
        var keys = Object.keys(detected);
        var pending = keys.length;
        var mains = [];
        
        keys.forEach(function (key) {
            var pkg = detected[key];
            var pkgdir = path.dirname(key);
            
            if (pkg.browser && typeof pkg.browser === 'string') {
                return set(pkg.browser);
            }
            if (pkg.main && pkg.browser) {
                var bkeys = Object.keys(pkg.browser).map(function (k) {
                    return path.relative('.', k);
                });
                var ix = bkeys.indexOf(pkg.main);
                if (ix >= 0) return set(bkeys[i]);
            }
            if (pkg.main) return set(pkg.main);
            
            var main = path.resolve(pkgdir, 'index.js');
            fs.exists(main, function (ex) {
                if (ex) set('index.js')
                else set();
            });
            
            function set (x) {
                if (x) mains.push(path.resolve(pkgdir, x));
                if (--pending === 0) {
                    console.log('mains=', mains);
                }
            }
        });
        /*
        var b = bundler(mains);
        parcelMap(b, opts, function (err, graph) {
        });
        */
    });
};
