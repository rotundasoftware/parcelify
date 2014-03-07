var path = require('path');
var fs = require( 'fs' );
var inherits = require( 'inherits' );
var EventEmitter = require( 'events' ).EventEmitter;
var _ = require( 'underscore' );
var async = require( 'async' );
var globwatcher = require( 'globwatcher' ).globwatcher;
var Asset = require( './asset' );

module.exports = Package;
inherits( Package, EventEmitter );

function Package( options ) {

	_.extend( this, _.pick( options,
		'id',
		'package',
		'path',
		'dependencies',
		'assetSrcPathsByType',
		'assetGlobsByType',
		'assetTransformsByType'
	) );

	this.dependentParcels = [];
	this.assetTypesToWriteToDisk = [];

	EventEmitter.call( this );
}

Package.prototype.createOutputDirectory = function( outputDirectoryPath, callback ) {
	var _this = this;

	fs.mkdir( outputDirectoryPath, function( err ) {
		if( err ) return callback( err );

		_this.outputDirectoryPath = outputDirectoryPath;
		callback();
	} );
};

Package.prototype.createAllAssets = function( assetTypes ) {
	var _this = this;

	_this.assetsByType = {};
	assetTypes.forEach( function( thisAssetType ) { _this.assetsByType[ thisAssetType ] = []; } );

	Object.keys( this.assetSrcPathsByType ).forEach( function( assetType ) {
		_this.assetSrcPathsByType[ assetType ].forEach( function( thisAssetSrcPath ) {
			var thisAsset = _this.createAsset( thisAssetSrcPath, assetType );
			if( ! _this.assetsByType[ assetType ] ) _this.assetsByType[ assetType ] = [];
			_this.assetsByType[ assetType ].push( thisAsset );
		} );
	} );
};

Package.prototype.createAsset = function( thisAssetSrcPath, assetType ) {
	var thisAssetDstPath = null;

	// if we have no output directory, then we will never write this asset to disk
	if( this.outputDirectoryPath ) {
		thisAssetDstPath = path.join( this.outputDirectoryPath, path.relative( _this.path, thisAssetSrcPath ) );
		if( assetType === 'style' ) thisAssetDstPath = renameFileExtension( thisAssetDstPath, '.css' );
	}

	var thisAsset = new Asset( thisAssetSrcPath, thisAssetDstPath, this.assetTransformsByType[ assetType ] );

	return thisAsset;
};

Package.prototype.writeAssetsToDisk = function( assetTypesToWriteToDisk ) {
	var _this = this;

	assetTypesToWriteToDisk.forEach( function( thisAssetType ) {
		_this.assetsByType[ thisAssetType ].forEach( function( thisAsset ) {
			thisAsset.writeStreamToDisk();
		} );
	} );

	this.assetTypesWrittenToDisk = _.union( this.assetTypesToWriteToDisk, assetTypesToWriteToDisk );
};

Package.prototype.addDependentParcel = function( parcel ) {
	this.dependentParcels = _.union( this.dependentParcels, parcel );
};

Package.prototype.createAssetGlobWatchers = function() {
	var _this = this;

	this.assetGlobWatches = [];

	function emitAssetUpdatedEventOnRelevantParcels( eventType, filePath, assetType ) {
		var allRelevantParcels = _this.parcelDependents;
		if( _this.isParcel ) allRelevantParcels.push( this );

		allRelevantParcels.forEach( function( thisParcel ) {
			thisParcel.emit( 'assetUpdated', eventType, filePath, assetType );
		} );
	}

	_.each( _this.assetGlobsByType, function( globs, thisAssetType ) {
		var thisWatcher = globwatcher( globs );

		thisWatcher.on( 'changed', function( srcPath ) {
			try {
				var asset = _.findWhere( _this.assetsByType[ thisAssetType ], { srcPath : srcPath } );
				if( ! asset ) console.log( 'Error: Couldn\'t file changed file ' + srcPath + ' in assets of type ' + thisAssetType );

				asset.createStream(); // create a new through stream for the asset

				if( _.contains( _this.assetTypesToWriteToDisk, thisAssetType ) ) asset.writeStreamToDisk();
			} catch( err ) {
				console.log( err );
				emitAssetUpdatedEventOnRelevantParcels( 'changed', srcPath, assetType );
			}
		} );

		thisWatcher.on( 'added', function( srcPath ) {
			var asset = _this.createAsset( srcPath, thisAssetType );
			_this.assetsByType[ assetType ].push( asset );
			if( _.contains( _this.assetTypesToWriteToDisk, thisAssetType ) ) asset.writeStreamToDisk();

			emitAssetUpdatedEventOnRelevantParcels( 'added', srcPath, assetType );
		} );

		thisWatcher.on( 'deleted', function( srcPath ) {
			_this.assetsByType = _.reject( _this.assetsByType, function( thisAsset ) { return thisAsset.srcPath === srcPath; } );
			
			emitAssetUpdatedEventOnRelevantParcels( 'deleted', srcPath, assetType );
		} );

		_this.assetGlobWatches.push( thisWatcher );
	} );
};

function renameFileExtension( file, toExt ) {
	return file.replace( new RegExp( path.extname( file ) + "$" ), toExt );
}