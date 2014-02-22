var path = require('path');

module.exports = Package;

function Package (pkg) {
    if (!(this instanceof Package)) return new Package(pkg);
    this._pkg = pkg;
}

Package.prototype.isParcelOf = function (b) {
    var pkg = this._pkg;
    var main = 'index.js';
    if (pkg.main) main = pkg.main;
    if (typeof pkg.browser === 'string') {
        main = pkg.browser;
    }
    if (pkg.browser) {
        var browser = {};
        Object.keys(pkg.browser).forEach(function (key) {
            var file = path.resolve(pkg.path, key);
            browser[file] = path.resolve(pkg.browser[key]);
        });
        if (browser[main]) main = browser[main];
    }
    main = path.resolve(pkg.path, main);
    return b._entries.indexOf(main) >= 0;
};

Package.prototype.writeFiles = function (outdir, cb) {
    var self = this;
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
            if (err) return self.emit('error', err)
            Object.keys(streams)
            
            ostream.pipe(self._withStreams(streams));
            ostream.resume();
        });
    });
};

Package.prototype._writeStreams = function (streams, cb) {
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
