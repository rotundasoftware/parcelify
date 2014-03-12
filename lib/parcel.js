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
	this.isParcel = true;
	this.jsBundleStream = options.jsBundleStream;
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

Parcel.prototype.setJsBundleStream = function( jsBundleStream ) {
	this.jsBundleStream = jsBundleStream;
};

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

Parcel.prototype.attachWatchListeners = function( bundles ) {
	var _this = this;

	this.on( 'assetUpdated', function( eventType, asset ) {
		if( _.contains( [ 'added', 'deleted' ], eventType ) )
			this.calcParcelAssets( [ asset.type ] );

		if( bundles[ asset.type ] ) {
			_this.writeBundle( asset.type, bundles[ asset.type ], function( err ) {
				if( err ) throw new Error( 'Error during watch.' );
				// ... done!
			} );
		}
	} );

	this.on( 'packageJsonUpdated', function() {
		var bundlesToRewrite = _.pick( bundles, _.without( Object.keys( bundles ), 'script' ) );
		this.calcParcelAssets( Object.keys( bundlesToRewrite ) );

		_this.writeBundles( bundlesToRewrite, function() {
			// ... done!
		} );
	} );
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

Parcel.prototype.writeBundles = function( bundles, callback ) {
	var _this = this;

	async.each( Object.keys( bundles ), function( thisAssetType, nextEach ) {
		if( ! bundles[ thisAssetType ] ) return nextEach();
	
		_this.writeBundle( thisAssetType, bundles[ thisAssetType ], nextEach );
	}, callback );
};


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

