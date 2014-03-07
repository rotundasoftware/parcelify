var inherits = require( 'inherits' );
var Package = require( './package' );
var _ = require( 'underscore' );
var async = require( 'async' );
var toposort = require( 'toposort' );
var through2 = require('through2');
var path = require( "path" );
var crypto = require('crypto');
var concat = require('concat-stream');
var fs = require('fs');

module.exports = Parcel;

inherits( Parcel, Package );

function Parcel( options, outputDirectoryPath ) {
	var _this = this;

	Package.call( this, options );

	this.view = options.view;
	this.jsBundleStream = options.jsBundleStream;
	this.isParcel = true;
}

Parcel.prototype.calcSortedDependencies = function( packageManifest ) {
	function getEdgesForPackageDependencyGraph( packageId ) {
		return packageManifest[ packageId ].dependencies.reduce( function( edges, dependentPackageId ) {
			return edges.concat( [ [ packageId, dependentPackageId ] ] ).concat( getEdgesForPackageDependencyGraph( dependentPackageId ) );
		}, [] );
	}

	var edges = getEdgesForPackageDependencyGraph( this.id );
	var sortedPackageIds = toposort( edges ).reverse();

	sortedPackageIds = _.union( sortedPackageIds, Object.keys( packageManifest ) ); // union cuz some packages have no dependencies!
	sortedPackageIds = _.without( sortedPackageIds, this.id );

	this.sortedDependencies = _.map( sortedPackageIds, function( thisPackageId ) { return packageManifest[ thisPackageId ]; } );
};

Parcel.prototype.attachWatchListeners = function( concatinateCss ) {
	// for watching
	this.on( 'assetUpdated', function( eventType, srcFile ) {
		switch( eventType ) {
			case 'added':
			case 'deleted':
				this.calcParcelAssets();
				break;
		}

		if( concatinateCss ) {
			_this.writeCssBundle( null, function( err ) {
				if( err ) throw new Error( 'Error during watch.' );
				// ... done
			} );
		}

		// just in case anything has changed (non-concated files added or removed, or shasums of bundles changed)
		_this.writeAssetsJson( function( err ) {
			if( err ) throw new Error( 'Error during watch.' );
		} );
	} );
};

Parcel.prototype.calcParcelAssets = function( assetTypes ) {
	memo = {};
	assetTypes.forEach( function( thisAssetType ) { memo[ thisAssetType ] = []; } );

	var sortedAssets = this.sortedDependencies.concat( this ).reduce( function( memo, thisPackage ) {
		var thisPackageAssets = thisPackage.assetsByType;

		_.each( thisPackageAssets, function( assets, thisAssetType ) {
			memo[ thisAssetType ] = memo[ thisAssetType ].concat( assets );
		} );

		return memo;
	}, memo );


	this.parcelAssetsByType = _.extend( {}, this.parcelAssetsByType, sortedAssets );
};

Parcel.prototype.writeAssetsToDisk = function( assetTypesToWriteToDisk ) {
	var _this = this;

	this.sortedDependencies.forEach( function( thisPackage ) {
		thisPackage.writeAssetsToDisk( assetTypesToWriteToDisk );
	} );

	Package.prototype.writeAssetsToDisk.apply( this, arguments );
};

Parcel.prototype.writeJsBundle = function( dstPath, callback ) {
	var _this = this;

	if( ! _this.outputDirectoryPath ) callback( new Error( 'Attempt to write bundle but no output directory has been created for the parcel.' ) );
   
	var jsBundle = through2();
	var tempJsBundlePath = path.join( _this.outputDirectoryPath, '.bundle_temp.js' );
	var jsBundleShasum;

	this.jsBundleStream.pipe( jsBundle );
	
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

		if( ! dstPath ) dstPath = path.join( _this.outputDirectoryPath, path.basename( _this.path ) + '_bundle_' + jsBundleShasum + '.js' );
		
		fs.rename( tempJsBundlePath, dstPath, function( err ) {
			if( err ) return callback( err );

			this.jsBundlePath = dstPath;

			callback( null );
		} );
	} );
};

Parcel.prototype.writeCssBundle = function( dstPath, callback ) {
	var _this = this;

	if( ! _this.outputDirectoryPath ) callback( new Error( 'Attempt to write bundle but no output directory has been created for the parcel.' ) );

	var cssBundle = through2();
	var cssBundleShasum;
	var tempCssBundlePath = path.join( _this.outputDirectoryPath, '.bundle_temp.css' );
	var destCssBundlePath;
	var styleStreams = _.pluck( this.parcelAssetsByType.style, 'stream' );

	if( styleStreams.length === 0 ) return callback();

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
		// default dstPath to include a shasum of file's conents
		if( ! dstPath ) dstPath = path.join( _this.outputDirectoryPath, path.basename( _this.path ) + '_bundle_' + cssBundleShasum + '.css' );

		fs.rename( tempCssBundlePath, dstPath, function( err ) {
			if( err ) return nextSeries( err );
			
			nextSeries();
		} );
	} ], function( err ) {
		if( err ) return callback( err );

		this.cssBundlePath = dstPath;

		return callback( null );
	} );
};

Parcel.prototype.writeAssetsJson = function( callback ) {
	var content = {
		'script' : this.jsBundlePath
	};

	if( this.cssBundlePath )
		content.style = this.cssBundlePath;
	else
		content.style = _.pluck( this.parcelAssetsByType.style, 'dstPath' );

	fs.writeFile( path.join( this.outputDirectoryPath, 'assets.json' ), JSON.stringify( content, null, 4 ), function( err ) {
		if( err ) return callback( err );

		return callback();
	} );
};
