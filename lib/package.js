var path = require('path');
var fs = require('fs');
var packageWriter = require('package-writer');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var through2 = require('through2');
var crypto = require('crypto');
var concat = require('concat-stream');
var _ = require('underscore');
var async = require('async');

module.exports = Package;
inherits(Package, EventEmitter);

function Package( pkg ) {
    if( ! (this instanceof Package) ) return new Package( pkg );
    EventEmitter.call( this );
    this._pkg = pkg;
}

Package.prototype.writeFiles = function( outputDirectoryPath, callback ) {
    var self = this;
    var pkg = self._pkg;

    fs.mkdir( outputDirectoryPath, function( err ) {
        if( err && err.code === 'EEXIST' ) {
            // some other instance has created this directory
            return callback( null, false );
        }
<<<<<<< HEAD
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
            var t = fileTypes[key];
            if (!types[t]) types[t] = {};
            types[t][key] = streams[key];
        });
=======
        if( err ) return callback( err );
>>>>>>> refactor
        
        var packageJson = pkg.package;
        var transformsByType = packageJson.transforms ? packageJson.transforms : {};

        packageWriter( pkg.path, pkg.assetsByType, transformsByType, outputDirectoryPath, function( err, streams, outputFilePathsByType ) {
            if( err ) return cb( err );

            callback( null, streams, outputFilePathsByType );
        } );
    } );
};
