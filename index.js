var fs = require('fs');
var path = require('path');
var browserify = require( 'browserify' );
var parcelMap = require('parcel-map');
var shasum = require('shasum');
var mkdirp = require('mkdirp');
var through2 = require('through2');
var path = require('path');
var _ = require('underscore');
var async = require('async');
var crypto = require('crypto');
var concat = require('concat-stream');
var glob = require( 'glob' );

var fs = require('fs');
var EventEmitter = require('events').EventEmitter;
var Package = require('./lib/package.js');

module.exports = function( mainPath, options, callback ) {
    var self = new EventEmitter();
    var ostream;
    var browerifyInstance = browserify( mainPath );
    var rootAssetsDirectoryPath = options.dst;

    options = _.defaults( {}, options, {
        keys : [],
        concatinateCss : true,
        applyPostprocessors : true
    } );

    mkdirp( rootAssetsDirectoryPath, function() {
        parcelMap( browerifyInstance, { keys : options.keys }, function( err, map ) {
            if( err ) return callback( err );

            makePackageRegistryFromParcelMap( map, options.keys, function( err, packageManifest ) {
                var thisParcelDirPath = path.dirname( mainPath );
                var thisParcel = _.findWhere( packageManifest, { path : thisParcelDirPath } );
                if( ! thisParcel ) return callback( new Error( 'Could not locate this parcel in parcel map.' ) );

                thisParcel.isParcel = true;

                var parcelOutputDirPath = path.join( rootAssetsDirectoryPath, thisParcel.id );
                var tempJsBundlePath = path.join( parcelOutputDirPath, '.bundle_temp.js' );
                var assetsJsonPath = path.join( parcelOutputDirPath, 'assets.json' );
                var assetsJsonContent = { 'script' : [], 'style' : [] };
                var jsBundleShasum, cssBundleShasum;

                async.series( [ function( nextSeries ) {
                    // go through all the packages returned by parcel-map and copy each one to its own directory in the root assets directory
                    async.each( _.values( packageManifest ), function( thisPackage, nextEach ) {
                        var p = new Package( thisPackage );

                        p.writeFiles( path.join( rootAssetsDirectoryPath, thisPackage.id ), { concatinateCss : options.concatinateCss }, function( err, cssFilePaths ) {
                            if( err ) return nextEach( err );

                            assetsJsonContent.style = assetsJsonContent.style.concat( cssFilePaths );

                            return nextEach();
                        } );
                    }, nextSeries );
                }, function( nextSeries ) {
                    var jsBundle = through2();

                    ostream.pipe( jsBundle );
                    
                    // pipe our js bundle output to both a temporary file and crypto at the same time. need
                    // the temporary file in order to empty the output, or something? not really sure.
                    async.parallel( [ function( nextParallel ) {
                        jsBundle.pipe( crypto.createHash( 'sha1' ) ).pipe( concat( function( buf ) {
                            jsBundleShasum = buf.toString( 'hex' );
                            nextParallel();
                        } ) );
                    }, function( nextParallel ) {
                        jsBundle.pipe( fs.createWriteStream( tempJsBundlePath ) ).on( 'close', nextParallel );
                    } ], nextSeries );
                }, function( nextSeries ) {
                    // now we have calculated the shasum, so we can write the final file that has the shasum in its name
                    var destJsBundlePath = path.join( parcelOutputDirPath, path.basename( thisParcel.path ) + '_bundle_' + jsBundleShasum + '.js' );
                    fs.rename( tempJsBundlePath, destJsBundlePath, function( err ) {
                        if( err ) return nextSeries( err );

                        assetsJsonContent.script.push( path.relative( rootAssetsDirectoryPath, destJsBundlePath ) );
                        nextSeries();
                    } );
                }, function( nextSeries ) {
                    // we have all the assets now, so write dat shit to the assets.json
                    fs.writeFile( assetsJsonPath, JSON.stringify( assetsJsonContent, null, 4 ), function( err ) {
                        if( err ) return nextSeries( err );
                        
                        return nextSeries();
                    } );
                } ], function( err ) {
                    if( err ) return callback( err );

                    callback( null, packageManifest, thisParcel.id );
                } );
            } );
        } );
        
        ostream = browerifyInstance.bundle().pipe( through2() );
    } );

    return self;
};

function makePackageRegistryFromParcelMap( map, assetTypes, callback ) {
    // parcel map returns a hash of package ids to package json contents.
    // we want some extra info in there, so we put the package json contents
    // in its own key and add an assets array to hold all the local assets
    // for each package.
    var packageManifest = {};
    _.each( map.packages, function( thisPackageJson, thisPackageId ) {
        packageManifest[ thisPackageId ] = {
            package : thisPackageJson,
            assets : []
        };
    } );

    _.each( map.assets, function( thisPackageId, thisAssetPath ) {
        packageManifest[ thisPackageId ].assets.push( thisAssetPath );
    } );
    
    async.each( Object.keys( packageManifest ), function( thisPackageId, nextPackage ) {
        var thisPackage = packageManifest[ thisPackageId ];

        thisPackage.id = thisPackageId;
        thisPackage.path = thisPackage.package.__dirname;
        thisPackage.dependencies = map.dependencies[ thisPackageId ] || [];
        if( thisPackage.package.view ) {
            thisPackage.view = path.resolve( thisPackage.path, thisPackage.package.view );
            thisPackage.isParcel = true;
        }

        thisPackage.assetsByType = {};
        async.each( assetTypes, function( thisAssetType, nextAssetType ) {
            var relativeGlobsOfThisType = thisPackage.package[ thisAssetType ] || [];
            if( _.isString( relativeGlobsOfThisType ) ) relativeGlobsOfThisType = [ relativeGlobsOfThisType ];
            var absoluteGlobsOfThisType = relativeGlobsOfThisType.map( function( thisGlob ) { return path.resolve( thisPackage.path, thisGlob ); } );
            
            async.map( absoluteGlobsOfThisType, glob, function( err, arrayOfResolvedGlobs ) {
                if( err ) return nextAssetType( err );

                var assetsOfThisType = _.flatten( arrayOfResolvedGlobs );
                thisPackage.assetsByType[ thisAssetType ] = assetsOfThisType;

                nextAssetType();
            } );
        }, nextPackage );
    }, function( err ) {
        if( err ) return callback( err );

        return callback( null, packageManifest );
    } );
}
