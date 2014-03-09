var inherits = require( 'inherits' );
var Package = require( './package' );
var _ = require( 'underscore' );
var async = require( 'async' );
var toposort = require( 'toposort' );
var through2 = require('through2');
var path = require( "path" );
var crypto = require('crypto');
var fs = require('fs');

module.exports = Parcel;

inherits( Parcel, Package );

function Parcel( options ) {
	var _this = this;

	Package.call( this, options );

	this.mainPath = options.mainPath;
	this.view = options.view;
	this.jsBundleStream = options.jsBundleStream;
	this.isParcel = true;
	this.bundlePathsByType = {};
	this.parcelAssetsByType = {};
}

// Parcel.prototype.calcSortedDependencies = function( packageManifest ) {
// 	function getEdgesForPackageDependencyGraph( packageId ) {
// 		return packageManifest[ packageId ].dependencies.reduce( function( edges, dependentPackageId ) {
// 			return edges.concat( [ [ packageId, dependentPackageId ] ] ).concat( getEdgesForPackageDependencyGraph( dependentPackageId ) );
// 		}, [] );
// 	}

// 	var edges = getEdgesForPackageDependencyGraph( this.id );
// 	var sortedPackageIds = toposort( edges ).reverse();

// 	sortedPackageIds = _.union( sortedPackageIds, Object.keys( packageManifest ) ); // union cuz some packages have no dependencies!
// 	sortedPackageIds = _.without( sortedPackageIds, this.id );

// 	this.sortedDependencies = _.map( sortedPackageIds, function( thisPackageId ) { return packageManifest[ thisPackageId ]; } );
// };


Parcel.prototype.calcSortedDependencies = function() {
	function getEdgesForPackageDependencyGraph( thisPackage ) {
		return thisPackage.dependencies.reduce( function( memo, dependentPackage ) {
			return memo.concat( [ [ thisPackage, dependentPackage ] ] ).concat( getEdgesForPackageDependencyGraph( dependentPackage ) );
		}, [] );
	}

	var edges = getEdgesForPackageDependencyGraph( this );
	var sortedPackages = toposort( edges ).reverse();

	//sortedPackages = _.union( sortedPackages, Object.keys( packageManifest ) ); // union cuz some packages have no dependencies!
	sortedPackages = _.without( sortedPackages, this );

	this.sortedDependencies = sortedPackages;
};

Parcel.prototype.attachWatchListeners = function( bundles ) {
	var _this = this;

	// for watching
	this.on( 'assetUpdated', function( eventType, asset ) {
		console.log( eventType );
		console.log( asset );
		
		if( _.contains( [ 'added', 'deleted' ], eventType ) )
			this.calcParcelAssets( [ asset.type ] );

		if( bundles[ asset.type ] ) {
			_this.writeBundle( asset.type, bundles[ asset.type ], function( err ) {
				if( err ) throw new Error( 'Error during watch.' );
				// ... done
			} );
		}
	} );
};

Parcel.prototype.createPackageOutputDirectories = function( dstDir, callback ) {
	async.each( this.sortedDependencies, function( thisPackage, nextPackage ) {
		var thisPackageId = thisPackage.id;
		var packageDirectoryPath = path.join( dstDir, thisPackageId );
		thisPackage.createOutputDirectory( packageDirectoryPath, nextPackage );
	}, callback );
};

// Parcel.prototype.createAllAssets = function( assetTypes ) {
// 	this.sortedDependencies.forEach( function( thisPackage ) {
// 		thisPackage.createAllAssets( assetTypes );
// 	} );

// 	Package.prototype.createAllAssets.apply( this, arguments );

// 	this.calcParcelAssets( assetTypes );
// };


// Parcel.prototype.writeAssetsToDisk = function( assetTypesToWriteToDisk ) {
// 	var _this = this;

// 	this.sortedDependencies.forEach( function( thisPackage ) {
// 		thisPackage.writeAssetsToDisk( assetTypesToWriteToDisk );
// 	} );

// 	Package.prototype.writeAssetsToDisk.apply( this, arguments );
// };


Parcel.prototype.writeBundle = function( assetType, dstPath, callback ) {
	var _this = this;

	var bundle = through2();

	// javascript bundle is special cased because we already have the stream from browserify
	if( assetType === 'script' )
		this.jsBundleStream.pipe( bundle );

	async.series( [ function( nextSeries ) {
		if( assetType === 'script' ) return nextSeries(); // js files have already been concatenated by browserify.

		var srcAssets = _this.parcelAssetsByType[ assetType ];
		if( srcAssets.length === 0 ) return callback(); // we don't want to create an empty bundle just because we have no source files

		// pipe all our individual style streams to the bundle in order to concatenate them
		async.eachSeries( srcAssets, function( thisAsset, nextAsset ) {
			var thisAssetStream = thisAsset.createReadStream();

			thisAssetStream.on( 'end', nextAsset );
			thisAssetStream.pipe( bundle, { end : false } );
		}, function( err ) {
			if( err ) return nextSeries( err );

			bundle.end();
			nextSeries();
		} );
	}, function( nextSeries ) {
		var tempBundlePath = path.join( path.dirname( dstPath ), '.temp_' + path.basename( dstPath ) );

		bundle.pipe( fs.createWriteStream( tempBundlePath ) ).on( 'close', function( err ) {
			if( err ) return callback( err );

			fs.rename( tempBundlePath, dstPath, function( err ) {
				if( err ) return callback( err );

				//_this.bundlePathsByType[ assetType ] = dstPath; // don't do this. isn't really a property of the parcel so much as an input to parcelify

				callback( null );
			} );
		} );
	} ], callback );
};

// Parcel.prototype.writeJsBundle = function( dstPath, callback ) {
// 	var _this = this;

// 	if( ! _this.outputDirectoryPath ) callback( new Error( 'Attempt to write bundle but no output directory has been created for the parcel.' ) );
   
// 	var jsBundle = through2();
// 	var tempJsBundlePath = path.join( _this.outputDirectoryPath, '.bundle_temp.js' );
// 	var jsBundleShasum;

// 	this.jsBundleStream.pipe( jsBundle );
	
// 	// pipe the bundle output to both a temporary file and crypto at the same time. need
// 	// the temporary file in order to empty the output, or something? not really sure.
// 	async.parallel( [ function( nextParallel ) {
// 		jsBundle.pipe( crypto.createHash( 'sha1' ) ).pipe( concat( function( buf ) {
// 			jsBundleShasum = buf.toString( 'hex' );
// 			nextParallel();
// 		} ) );
// 	}, function( nextParallel ) {
// 		jsBundle.pipe( fs.createWriteStream( tempJsBundlePath ) ).on( 'close', nextParallel );
// 	} ], function( err ) {
// 		if( err ) return callback( err );

// 		if( ! dstPath ) dstPath = path.join( _this.outputDirectoryPath, path.basename( _this.path ) + '_bundle_' + jsBundleShasum + '.js' );
		
// 		fs.rename( tempJsBundlePath, dstPath, function( err ) {
// 			if( err ) return callback( err );

// 			this.jsBundlePath = dstPath;

// 			callback( null );
// 		} );
// 	} );
// };

// Parcel.prototype.writeCssBundle = function( dstPath, callback ) {
// 	var _this = this;

// 	if( ! _this.outputDirectoryPath ) callback( new Error( 'Attempt to write bundle but no output directory has been created for the parcel.' ) );

// 	var cssBundle = through2();
// 	var cssBundleShasum;
// 	var tempCssBundlePath = path.join( _this.outputDirectoryPath, '.bundle_temp.css' );
// 	var destCssBundlePath;
// 	var styleStreams = _.pluck( this.parcelAssetsByType.style, 'stream' );

// 	if( styleStreams.length === 0 ) return callback();

// 	async.series( [ function( nextSeries ) {
// 		// pipe all our style streams to the css bundle in order
// 		async.eachSeries( styleStreams, function( thisStyleStream, nextStyleStream ) {
// 			thisStyleStream.pipe( cssBundle, { end : false } );
// 			thisStyleStream.on( 'end', nextStyleStream );
// 		}, function( err ) {

// 			if( err ) return nextSeries( err );

// 			cssBundle.end();
// 			nextSeries();
// 		} );
// 	}, function( nextSeries ) {
// 		// pipe our bundle to both a temporary file and crypto at the same time. need
// 		// the temporary file in order to empty the output, or something? not really sure.
// 		async.parallel( [ function( nextParallel ) {
// 			cssBundle.pipe( crypto.createHash( 'sha1' ) ).pipe( concat( function( buf ) {
// 				cssBundleShasum = buf.toString( 'hex' );
// 				nextParallel();
// 			} ) );
// 		}, function( nextParallel ) {
// 			cssBundle.pipe( fs.createWriteStream( tempCssBundlePath ) ).on( 'close', nextParallel );
// 		} ], nextSeries );

// 	}, function( nextSeries ) {
// 		// default dstPath to include a shasum of file's conents
// 		if( ! dstPath ) dstPath = path.join( _this.outputDirectoryPath, path.basename( _this.path ) + '_bundle_' + cssBundleShasum + '.css' );

// 		fs.rename( tempCssBundlePath, dstPath, function( err ) {
// 			if( err ) return nextSeries( err );
			
// 			nextSeries();
// 		} );
// 	} ], function( err ) {
// 		if( err ) return callback( err );

// 		this.cssBundlePath = dstPath;

// 		return callback( null );
// 	} );
// };

// Parcel.prototype.writeAssetsJson = function( callback ) {
// 	var content = {
// 		'script' : this.jsBundlePath
// 	};

// 	if( this.cssBundlePath )
// 		content.style = this.cssBundlePath;
// 	else
// 		content.style = _.pluck( this.parcelAssetsByType.style, 'dstPath' );

// 	fs.writeFile( path.join( this.outputDirectoryPath, 'assets.json' ), JSON.stringify( content, null, 4 ), function( err ) {
// 		if( err ) return callback( err );

// 		return callback();
// 	} );
// };


Parcel.prototype.calcParcelAssets = function( assetTypes ) {
	memo = {};
	assetTypes.forEach( function( thisAssetType ) { memo[ thisAssetType ] = []; } );

	var sortedAssets = this.sortedDependencies.concat( this ).reduce( function( memo, thisPackage ) {
		var thisPackageAssets = thisPackage.assetsByType;

		_.each( thisPackageAssets, function( assets, thisAssetType ) {
			if( _.contains( assetTypes, thisAssetType ) )
				memo[ thisAssetType ] = memo[ thisAssetType ].concat( assets );
		} );

		return memo;
	}, memo );


	this.parcelAssetsByType = _.extend( {}, this.parcelAssetsByType, sortedAssets );
};
