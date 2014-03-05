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
var toposort = require( "toposort" );

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

    var assetTypes = options.keys;

    mkdirp( rootAssetsDirectoryPath, function() {
        parcelMap( browerifyInstance, { keys : assetTypes }, function( err, map ) {
            if( err ) return callback( err );

            makePackageRegistryFromParcelMap( map, assetTypes, function( err, packageManifest ) {
                var thisParcelDirPath = path.dirname( mainPath );
                var thisParcel = _.findWhere( packageManifest, { path : thisParcelDirPath } );
                if( ! thisParcel ) return callback( new Error( 'Could not locate this parcel in parcel map.' ) );

                thisParcel.isParcel = true;

                var parcelOutputDirPath = path.join( rootAssetsDirectoryPath, thisParcel.id );
                var assetsJsonPath = path.join( parcelOutputDirPath, 'assets.json' );
                var assetsJsonContent = { 'script' : [], 'style' : [] };
                var sortedPackageIds = getSortedPackageIds( thisParcel.id, packageManifest );

                async.series( [ function( nextSeries ) {
                    // go through all the packages returned by parcel-map and copy each one to its own directory in the root assets directory

                    async.eachSeries( sortedPackageIds, function( thisPackageId, nextPackageId ) {
                        var thisPackage = packageManifest[ thisPackageId ];
                        var p = new Package( thisPackage );

                        p.writeFiles( path.join( rootAssetsDirectoryPath, thisPackage.id ), function( err, outAssetsByType ) {
                            if( err ) return nextPackageId( err );

                            thisPackage.outAssetsByType = outAssetsByType;

                            assetsJsonContent.style = assetsJsonContent.style.concat( _.pluck( outAssetsByType.style, 'dstPath' ) );

                            return nextPackageId();
                        } );
                    }, nextSeries );
                }, function( nextSeries ) {
                    // we are done copying packages and collecting our asset streams. Now write our bundles to disk.
                    async.parallel( [ function( nextParallel ) {
                        writeJsBundle( parcelOutputDirPath, path.basename( thisParcel.path ), ostream, function( err, jsBundlePath ) {
                            assetsJsonContent.script.push( jsBundlePath );
                            nextParallel();
                        } );
                    }, function( nextParallel ) {
                        var assetTypesToWriteToDisk = _.clone( assetTypes );

                        if( options.concatinateCss ) {
                            var cssStreamsToBundle = sortedPackageIds.reduce( function( memo, thisPackageId ) {
                                var cssStreamsThisPackage = _.pluck( packageManifest[ thisPackageId ].outAssetsByType.style, 'stream' );
                                return memo.concat( cssStreamsThisPackage || [] );
                            }, [] );

                            writeCssBundle( parcelOutputDirPath, path.basename( thisParcel.path ), cssStreamsToBundle, function( err, cssBundlePath ) {
                                assetsJsonContent.style = [];
                                assetsJsonContent.style.push( cssBundlePath );
                                nextParallel();
                            } );
                            
                            // since we are concatenating css into a bundle we do not need to write the individual css files
                            assetTypesToWriteToDisk = _.without( assetTypesToWriteToDisk, 'style' );
                        }
                        
                        // go through all our packages, and all the assets in each package, and hook up the stream for 
                        // the assets to a writable file stream at the asset's destination path.
                        sortedPackageIds.forEach( function( thisPackageId ) {
                            assetTypesToWriteToDisk.forEach( function( thisAssetType ) {
                                packageManifest[ thisPackageId ].outAssetsByType[ thisAssetType ].forEach( function( thisAsset ) {
                                    thisAsset.stream.pipe( fs.createWriteStream( thisAsset.dstPath ) );
                                } );
                            } );
                        } );
                    } ], nextSeries );
                }, function( nextSeries ) {
                    // all assets are written to disk, transformed, bundled and post-processed. All we have to do now is write our assets.json
                    // so the hook can find them at run-time.

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

function writeJsBundle( destDir, destFilePrefix, jsStream, callback ) {
    var jsBundle = through2();
    var tempJsBundlePath = path.join( destDir, '.bundle_temp.js' );
    var jsBundleShasum;

    jsStream.pipe( jsBundle );
    
    // pipe the bundle output to both a temporary file and crypto at the same time. need
    // the temporary file in order to empty the output, or something? not really sure.
    async.parallel( [ function( nextParallel ) {
        jsBundle.pipe( crypto.createHash( 'sha1' ) ).pipe( concat( function( buf ) {
            jsBundleShasum = buf.toString( 'hex' );
            nextParallel();
        } ) );
    }, function( nextParallel ) {
        jsBundle.pipe( fs.createWriteStream( tempJsBundlePath ) ).on( 'close', nextParallel );
    } ], function( err ) {
        if( err ) return callback( err );

        var destJsBundlePath = path.join( destDir, destFilePrefix + '_bundle_' + jsBundleShasum + '.js' );
        fs.rename( tempJsBundlePath, destJsBundlePath, function( err ) {
            if( err ) return callback( err );

            callback( null, destJsBundlePath );
        } );
    } );
}

function writeCssBundle( destDir, destFilePrefix, styleStreams, callback ) {
    var cssBundle = through2();
    var cssBundleShasum;
    var tempCssBundlePath = path.join( destDir, '.bundle_temp.css' );
    var destCssBundlePath;

    async.series( [ function( nextSeries ) {
        // pipe all our style streams to the css bundle in order
        async.eachSeries( styleStreams, function( thisStyleStream, nextStyleStream ) {
            thisStyleStream.pipe( cssBundle, { end : false } );
            thisStyleStream.on( 'end', nextStyleStream );
        }, function( err ) {
             if( err ) return nextSeries( err );

             cssBundle.end();
             nextSeries();
        } );
    }, function( nextSeries ) {
        // pipe our bundle to both a temporary file and crypto at the same time. need
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
        destCssBundlePath = path.join( destDir, destFilePrefix + '_bundle_' + cssBundleShasum + '.css' );
        fs.rename( tempCssBundlePath, destCssBundlePath, function( err ) {
            if( err ) return nextSeries( err );
            
            nextSeries();
        } );
    } ], function( err ) {
        if( err ) return callback( err );

        return callback( null, destCssBundlePath );
    } );
}

function getSortedPackageIds( topParcelId, packageManifest ) {

    function getEdgesForPackageDependencyGraph( packageId, packageManifest ) {
        return packageManifest[ packageId ].dependencies.reduce( function( edges, dependentPackageId ) {
            return edges.concat( [ [ packageId, dependentPackageId ] ] ).concat( getEdgesForPackageDependencyGraph( dependentPackageId, packageManifest ) );
        }, [] );
    }

    var edges = getEdgesForPackageDependencyGraph( topParcelId, packageManifest );
    return toposort( edges ).reverse();
}

