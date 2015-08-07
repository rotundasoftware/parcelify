var inherits = require( 'inherits' );
var Package = require( './package' );
var _ = require( 'underscore' );
var async = require( 'async' );
var toposort = require( 'toposort' );
var through2 = require( 'through2' );
var path = require( 'path' );
var crypto = require( 'crypto' );
var fs = require( 'fs' );

module.exports = Parcel;

inherits( Parcel, Package );

function Parcel( options ) {
	var _this = this;

	Package.call( this, options );

	this.mainPath = options.mainPath;
	this.isParcel = true;
	this.bundlePathsByType = {};
	this.parcelAssetsByType = {};

	this.dependentParcels.push( this ); // parcels depend on themselves!
}

Parcel.prototype.calcSortedDependencies = function() {
	var packagesWithDependencies = [];

	function getEdgesForPackageDependencyGraph( thisPackage, thisTreeLevel, packageTreeLevels ) {
		if( _.isUndefined( thisTreeLevel ) ) thisTreeLevel = 0;
		if( _.isUndefined( packageTreeLevels ) ) packageTreeLevels = {};

		if( ! packageTreeLevels[ thisPackage.path ] ) packageTreeLevels[ thisPackage.path ] = thisTreeLevel;

		return thisPackage.dependencies.reduce( function( memo, thisDependentPackage ) {
			// these conditionals are to avoid cycles and infinite recursion.
			// first, we only traverse each node once to avoid infinite recursion.
			if( _.isUndefined( packageTreeLevels[ thisDependentPackage.path ] ) ) {
				memo = memo.concat( getEdgesForPackageDependencyGraph( thisDependentPackage, thisTreeLevel + 1, packageTreeLevels ) );
			}

			// second, we keep track of the levels of the nodes in the dependency tree (where
			// level 0 is the root node i.e. the parcel itself). nodes can only have dependencies
			// on other nodes with a level equal to or greater than their own. done.
			if( packageTreeLevels[ thisDependentPackage.path ] >= packageTreeLevels[ thisPackage.path ] ) {
				memo = memo.concat( [ [ thisPackage, thisDependentPackage ] ] );
			}

			return memo;
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
			_this.writeBundle( asset.type, bundles[ asset.type ], function( err, bundleWasWritten ) {
				if( err ) return _this.emit( 'error', err );

				if( bundleWasWritten ) _this.emit( 'bundleUpdated', bundles[ asset.type ], asset.type );
				// ... done!
			} );
		}
	} );

	this.on( 'packageJsonUpdated', function( thePackage ) {
		var bundlesToRewrite = _.pick( bundles, _.without( Object.keys( bundles ), 'script' ) );
		this.calcParcelAssets( Object.keys( bundlesToRewrite ) );

		async.each( Object.keys( bundlesToRewrite ), function( thisAssetType, nextEach ) {
			var thisBundlePath = bundlesToRewrite[ thisAssetType ];
			if( ! thisBundlePath ) return nextEach();
		
			_this.writeBundle( thisAssetType, thisBundlePath, function( err, bundleWasWritten ) {
				// don't stop writing other bundles if there was an error on this one. errors happen
				// frequently with transforms.. like invalid scss, etc. don't stop the show, just 
				// keep going with our other bundles.

				if( err ) _this.emit( 'error', err );
				else if( bundleWasWritten ) _this.emit( 'bundleWritten', thisBundlePath, thisAssetType, true );

				nextEach();
			} );
		}, function( err ) {
			if( err ) _this.emit( 'error', err );

			 // done );
		} );
	} );
};

Parcel.prototype.writeBundle = function( assetType, dstPath, callback ) {
	var _this = this;
		
	var srcAssets = _this.parcelAssetsByType[ assetType ];
	if( ! srcAssets || srcAssets.length === 0 ) return callback( null, false ); // we don't want to create an empty bundle just because we have no source files

	var bundle = through2();
	var tempBundlePath = path.join( path.dirname( dstPath ), '.temp_' + path.basename( dstPath ) );

	bundle.pipe( fs.createWriteStream( dstPath ) ).on( 'close', function ( err ) {
		// execution resumes here after all the individual asset streams
		// have been piped to this bundle. we need to pipe the bundle to the writable
		// stream first (before individual assets are piped to bundle stream)
		// so that if the high water mark is reached on one of the readable streams
		// it doesn't pause (with no way to resume). See github issue #15.
		
		if( err ) return callback( err, false );

		// fs.rename( tempBundlePath, dstPath, function( err ) {
		// 	if( err ) console.log( 'yoyoyoo', fs.existsSync( tempBundlePath ), dstPath, srcAssets );

		// 	if( err ) return callback( err );

			//_this.bundlePathsByType[ assetType ] = dstPath; // don't do this. isn't really a property of the parcel so much as an input to parcelify

			callback( null, true );
		// } );
	} );

	// pipe all our individual style streams to the bundle in order to concatenate them
	async.eachSeries( srcAssets, function( thisAsset, nextAsset ) {
		var thisAssetStream = thisAsset.createReadStream();

		thisAssetStream.on( 'error', function( err ) {
			nextAsset( new Error( 'While reading or transforming "' + thisAsset.srcPath + '":\n' + err.message ) );
		} );

		thisAssetStream.on( 'end', function( err ) {
			nextAsset();
		} );

		thisAssetStream.pipe( bundle, { end : false } );
	}, function( err ) {
		if( err ) return callback( err, false );

		bundle.end();
		
		// execution will resume up above on the
		// `close` event handler for our bundle
	} );
};

