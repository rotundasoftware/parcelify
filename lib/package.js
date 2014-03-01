var path = require('path');
var fs = require('fs');
var packageWriter = require('package-writer');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var through2 = require('through2');
var crypto = require('crypto');
var concat = require('concat-stream');

module.exports = Package;
inherits(Package, EventEmitter);

function Package (pkg) {
    if (!(this instanceof Package)) return new Package(pkg);
    EventEmitter.call(this);
    this._pkg = pkg;
}

Package.prototype.isParcelOf = function (b) {
    var pkg = this._pkg, p = pkg.package || {};
    var main = 'index.js';
    if (p.main) main = p.main;
    if (typeof p.browser === 'string') {
        main = p.browser;
    }
    if (p.browser) {
        var browser = {};
        Object.keys(p.browser).forEach(function (key) {
            var file = path.resolve(pkg.path, key);
            browser[file] = path.resolve(p.browser[key]);
        });
        if (browser[main]) main = browser[main];
    }
    main = path.resolve(pkg.path, main);
    return b._entries.indexOf(main) >= 0;
};

Package.prototype.writeFiles = function (outdir, cb) {
    var self = this;
    var pkg = self._pkg;
    
    var fileTypes = Object.keys(pkg.files).reduce(function (acc, key) {
        pkg.files[key].forEach(function (file) {
            acc[file] = key;
        });
        return acc;
    }, {});
    
    fs.mkdir(outdir, function (err) {
        if (err && err.code === 'EEXIST') {
            // some other instance has created this directory
            return cb(null, false);
        }
        if (err) return self.emit('error', err);
        
        var p = pkg.package;
        p.path = pkg.path;
        if (!p.cartero) p.cartero = {};
        
        packageWriter(p, pkg.files, outdir, function (err, streams) {
            if (err) return cb(err);
            writeStreams(streams);
        });
    });
    
    var pending = 4;
    function done () {
        if (--pending === 0) renameFiles();
    }
    
    var tmpjs = path.join(outdir, '.bundle_' + pkg.id + '.js');
    var tmpcss = path.join(outdir, '.bundle_' + pkg.id + '.css');
    var hashjs, hashcss;
    
    var jsBundle = through2();
    var hjs = crypto.createHash('sha1');
    jsBundle.pipe(hjs).pipe(concat(function (buf) {
        hashjs = buf.toString('hex');
        done();
    }));
    jsBundle.pipe(fs.createWriteStream(tmpjs)).on('close', done);
    
    var cssBundle = through2();
    var cssPending = 0;
    var hcss = crypto.createHash('sha1');
    cssBundle.pipe(hcss).pipe(concat(function (buf) {
        hashcss = buf.toString('hex');
        done();
    }));
    cssBundle.pipe(fs.createWriteStream(tmpcss)).on('close', done);
    
    return jsBundle;
    
    function writeStreams (streams) {
        var types = {};
        Object.keys(streams).forEach(function (key) {
            //streams[key].on('end', done);
            
            var t = fileTypes[key];
            if (!types[t]) types[t] = {};
            types[t][key] = streams[key];
        });
        
        Object.keys(types.style || {}).forEach(function (key) {
            cssPending ++;
            var stream = types.style[key];
            stream.on('end', function () {
                if (-- cssPending === 0) cssBundle.push(null);
            });
            stream.pipe(cssBundle, { end: false });
        });
    }
    
    function renameFiles () {
        var rpending = 2;
        
        var dstjs = path.join(outdir, 'bundle_' + hashjs + '.js');
        var dstcss = path.join(outdir, 'bundle_' + hashcss + '.css');
        
        fs.rename(tmpjs, dstjs, function (err) {
            if (err) return cb(err);
            self.emit('bundle.js', dstjs);
            if (-- rpending === 0) cb();
        });
        fs.rename(tmpcss, dstcss, function (err) {
            if (err) return cb(err);
            self.emit('bundle.css', dstcss);
            if (-- rpending === 0) cb();
        });
    }
};
