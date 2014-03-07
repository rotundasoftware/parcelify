var path = require('path');
var browserify = require( 'browserify' );
var watchify = require( 'watchify' );
var parcelMap = require('parcel-map');
var shasum = require('shasum');
var mkdirp = require('mkdirp');
var through2 = require('through2');
var path = require('path');
var _ = require('underscore');
var async = require('async');
var glob = require( 'glob' );
var resolve = require( 'resolve' );
var Package = require( './lib/package' );
var Parcel = require( './lib/parcel' );
var resolve = require( 'resolve' );

var EventEmitter = require('events').EventEmitter;
var Package = require('./lib/package.js');

module.exports = processParcel = function( mainPath, options, callback ) {
	var _this = new EventEmitter();
	var ostream;

	options = _.defaults( {}, options, {
		dstDir: undefined,	// required

		bundleMode: true,
		watch : true,

		packageTransform : undefined,

		// when bundle mode is false...
		concatinateCss : true,
		concatinateTmpl : true,

		browerifyInstance : undefined,
		packageManifest : undefined
	} );

	if( ! options.dstDir ) callback( new Error( 'Destination directory must be defined.' ) );

	var packageManifest = options.packageManifest || {};
	var assetTypes = [ 'style', 'template', 'image' ];
	var concatinateCss = options.bundleMode || options.concatinateCss;

	var browerifyInstance;
	if( ! options.browerifyInstance ) {
		var browserifyOptions = mainPath;

		if( options.watch ) {
			browerifyInstance = watchify( browserifyOptions );

			browerifyInstance.on( 'update', function( changedMains )  {
				async.each( changedMains, function( thisMain, nextEach ) {
					var newOptions = _.clone( options );
					newOptions.browserifyInstance = browerifyInstance;

					processParcel( thisMain, options, function( err ) {
						console.log( 'updated ' + thisMain );
						nextEach();
					} );
				}, function( err ) {
					if( err ) return callback( err );

					// do nothing...
				} );
			} );
		}
		else browerifyInstance = browserify( mainPath );
	} else browerifyInstance = options.browerifyInstance;

	async.series( [ function( nextSeries ) {
		if( ! options.dstDir ) nextSeries();

		mkdirp( options.dstDir, nextSeries );
	} ], function( err ) {
		if( err ) return _this.emit( 'error' );

		parcelMap( browerifyInstance, { keys : assetTypes }, function( err, map ) {
			if( err ) return callback( err );

			var packagesThatWereCreated;

			addParcelMapToPackageManifest( path.dirname( mainPath ), ostream, map, packageManifest, assetTypes, function( err, thisParcel, packagesThatWereCreated ) {
				async.series( [ function( nextSeries ) {
					createDirectoriesAndAssetsForPackages( packagesThatWereCreated, options.dstDir, assetTypes, options.bundleMode, nextSeries );
				}, function( nextSeries ) {
					thisParcel.calcParcelAssets( assetTypes ); // needs to be done after all assets have been created, clearly

					var assetTypesToWriteToDisk = _.clone( assetTypes );
					// if we are concatenating css into a bundle we do not need to write the individual css files
					if( concatinateCss ) assetTypesToWriteToDisk = _.without( assetTypesToWriteToDisk, 'style' );
					thisParcel.writeAssetsToDisk( assetTypesToWriteToDisk );

					// we are done copying packages and collecting our asset streams. Now write our bundles to disk.
					async.parallel( [ function( nextParallel ) {
						thisParcel.writeJsBundle( null, function( err, jsBundlePath ) {
							nextParallel();
						} );
					}, function( nextParallel ) {
						if( ! concatinateCss ) nextParallel();

						thisParcel.writeCssBundle( null, function( err, cssBundlePath ) {
							nextParallel();
						} );
					} ], nextSeries );
				}, function( nextSeries ) {
					thisParcel.writeAssetsJson( nextSeries );
					if( options.watch ) {
						packagesThatWereCreated.forEach( function( thisPackage ) { thisPackage.createAssetGlobWatchers(); } );
						thisParcel.attachWatchListeners( concatinateCss );
					}
				} ], function( err ) {
					if( err ) return callback( err );

					callback( null, packageManifest, thisParcel.id );
				} );
			} );
		} );
		
		// get things moving. note we need to do this after parcelMap has been called with the browserify instance
		ostream = browerifyInstance.bundle( {
			packageFilter : options.packageTransform
		} ).pipe( through2() );
	} );

	return _this;
};

function addParcelMapToPackageManifest( pathOfMappedParcel, jsBundleStream, map, packageManifest, assetTypes, callback ) {
	var mappedParcel = null;
	var packagesThatWereCreated = [];

	async.each( Object.keys( map.packages ), function( thisPackageId, nextPackageId ) {
		var packageOptions = {};
		var thisPackageTheIsMappedParcel = false;

		async.series( [ function( nextSeries ) {
			packageOptions.package = map.packages[ thisPackageId ];
			packageOptions.id = thisPackageId;
			packageOptions.path = packageOptions.package .__dirname;

			if( packageOptions.path === pathOfMappedParcel ) {
				thisPackageTheIsMappedParcel = true;
			}

			if( packageManifest[ thisPackageId ] && ! thisPackageTheIsMappedParcel )
				// this package is already in the parcel map, so we use what is already there (unless this is the mapped parcel, in which case we always want to re-create)
				return nextPackageId();

			packageOptions.dependencies = map.dependencies[ thisPackageId ] || [];

			packageOptions.assetSrcPathsByType = {};
			packageOptions.assetTransformsByType = {};
			packageOptions.assetGlobsByType = {};

			async.each( assetTypes, function( thisAssetType, nextAssetType ) {
				async.parallel( [ function( nextParallel ) {
					packageOptions.assetSrcPathsByType[ thisAssetType ] = [];

					// resolve relative globs to absolute globs
					var relativeGlobsOfThisType = packageOptions.package[ thisAssetType ] || [];
					if( _.isString( relativeGlobsOfThisType ) ) relativeGlobsOfThisType = [ relativeGlobsOfThisType ];
					var absoluteGlobsOfThisType = relativeGlobsOfThisType.map( function( thisGlob ) { return path.resolve( packageOptions.path, thisGlob ); } );
					packageOptions.assetGlobsByType[ thisAssetType ] = absoluteGlobsOfThisType;

					// resolve absolute globs to actual src files
					async.map( absoluteGlobsOfThisType, glob, function( err, arrayOfResolvedGlobs ) {
						if( err ) return nextAssetType( err );

						var assetsOfThisType = _.flatten( arrayOfResolvedGlobs );
						packageOptions.assetSrcPathsByType[ thisAssetType ] = assetsOfThisType;

						nextAssetType();
					} );
				}, function( nextParallel ) {
					// resolve transform names to actual tranforms
					packageOptions.assetTransformsByType[ thisAssetType ] = [];

					transformsByType = packageOptions.package.transforms ? packageOptions.package.transforms : {};
					transformNames = transformsByType[ thisAssetType ] || [];
					async.map( transformNames, function( thisTransformName, nextTransform ) {
						resolve.sync( thisTransformName, { basedir : _this.path }, function( err, res ) {
							if( err ) return nextTransform( err );
							nextTransform( null, require( res ) );
						} );
					}, function( err, transforms ) {
						packageOptions.assetTransformsByType[ thisAssetType ] = transforms;
						nextParallel();
					} );
				} ], nextAssetType );
			}, nextSeries );
		}, function( nextSeries ) {
			if( thisPackageTheIsMappedParcel ) {
				packageOptions.view = path.resolve( packageOptions.path, packageOptions.package.view );
				packageOptions.jsBundleStream = jsBundleStream;
				packageManifest[ thisPackageId ] = mappedParcel = new Parcel( packageOptions );
			} else {
				packageManifest[ thisPackageId ] = new Package( packageOptions );
			}

			packagesThatWereCreated.push( packageManifest[ thisPackageId ] );
			nextSeries();
		} ], nextPackageId );
	}, function( err ) {
		if( err ) return callback( err );

		if( ! mappedParcel ) return callback( new Error( 'Could not locate this mapped parcel id.' ) );

		mappedParcel.calcSortedDependencies( packageManifest );

		Object.keys( map.packages ).forEach( function( thisPackageId ) {
			packageManifest[ thisPackageId ].addDependentParcel( mappedParcel );
		} );

		return callback( null, mappedParcel, packagesThatWereCreated );
	} );
}

function createDirectoriesAndAssetsForPackages( packages, dstDir, assetTypes, bundleMode, callback ) {
	// go through all the packages returned by parcel-map and copy each one to its own directory in the root assets directory
	async.each( packages, function( thisPackage, nextPackage ) {
		var thisPackageId = thisPackage.id;

		var packageDirectoryPath;

		if( thisPackage.isParcel ) {
			packageDirectoryPath = bundleMode ? path.join( dstDir, thisPackage.id ) : dstDir;
		} else {
			packageDirectoryPath = path.join( dstDir, thisPackageId );
		}

		async.parallel( [ function( nextParallel ) {
			if( bundleMode && ! thisPackage.isParcel ) return nextParallel();

			thisPackage.createOutputDirectory( packageDirectoryPath, nextParallel );
		}, function( nextParallel ) {
			thisPackage.createAllAssets( assetTypes );
			
			nextParallel();
		} ], nextPackage );
	}, callback );
}
