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

Package.prototype.writeFiles = function( outputDirectoryPath, options, callback ) {
    var self = this;
    var pkg = self._pkg;

    options = _.defaults( {}, options, {
        concatinateCss : true
    } );

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

            if( options.concatinateCss ) {
                var styleStreams = _.values( _.pick( streams, pkg.assetsByType.style ) );
                writeCssBundle( styleStreams, function( err, cssBundlePath ) {
                    if( err ) return callback( err );

                    callback( null, [ cssBundlePath ] );
                } );
            }
            else
                callback( null, outputFilePathsByType.style );
        } );
    } );
    
    function writeCssBundle( styleStreams, callback ) {
        var cssBundle = through2();
        var cssBundleShasum;
        var tempCssBundlePath = path.join( outputDirectoryPath, '.bundle_temp.css' );
        var destCssBundlePath;

        async.series( [ function( nextSeries ) {
            async.each( styleStreams, function( thisStyleStream, nextEach ) {
                thisStyleStream.pipe( cssBundle, { end: false } );
                thisStyleStream.on( 'end', nextEach );
            }, function( err ) {
                if( err ) return cb( err );

                cssBundle.push( null );
                nextSeries();
            } );
        }, function( nextSeries ) {

            // pipe our js bundle output to both a temporary file and crypto at the same time. need
            // the temporary file in order to empty the output, or something? not really sure.
            async.parallel( [ function( nextParallel ) {
                cssBundle.pipe( crypto.createHash( 'sha1' ) ).pipe( concat( function( buf ) {
                    cssBundleShasum = buf.toString( 'hex' );
                    nextParallel();
                } ) );
            }, function( nextParallel ) {
                cssBundle.pipe( fs.createWriteStream( tempCssBundlePath ) ).on( 'close', nextParallel );
            } ], nextSeries );

        }, function( nextSeries ) {
            // now we have calculated the shasum, so we can write the final file that has the shasum in its name
            destCssBundlePath = path.join( outputDirectoryPath, path.basename( pkg.path ) + '_bundle_' + cssBundleShasum + '.css' );
            fs.rename( tempCssBundlePath, destCssBundlePath, function( err ) {
                if( err ) return nextSeries( err );
                
                self.emit( 'bundle.css', destCssBundlePath );
                nextSeries();
            } );
        } ], function( err ) {
            if( err ) return callback( err );

            return callback( null, destCssBundlePath );
        } );
    }
};
