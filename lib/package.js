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
        if( err ) return callback( err );
        
        var packageJson = pkg.package;
        var transformsByType = packageJson.transforms ? packageJson.transforms : {};

        packageWriter( pkg.path, pkg.assetsByType, transformsByType, outputDirectoryPath, function( err, streams, outputFilePathsByType ) {
            if( err ) return cb( err );

            callback( null, streams, outputFilePathsByType );
        } );
    } );
};
