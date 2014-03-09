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

	this.dependencies = [];
	this.dependentParcels = [];

	EventEmitter.call( this );
}

// Package.prototype.createOutputDirectory = function( outputDirectoryPath, callback ) {
// 	var _this = this;

// 	fs.mkdir( outputDirectoryPath, function( err ) {
// 		if( err ) return callback( err );

// 		_this.outputDirectoryPath = outputDirectoryPath;
// 		callback();
// 	} );
// };

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

	var thisAsset = new Asset( thisAssetSrcPath, thisAssetDstPath, assetType, this.assetTransformsByType[ assetType ] );

	return thisAsset;
};

Package.prototype.writeAssetsToDisk = function( assetTypesToWriteToDisk, outputDirectoryPath, makeDirs, callback ) {
	var _this = this;

	async.each( assetTypesToWriteToDisk, function( thisAssetType, nextAssetType ) {
		async.each( _this.assetsByType[ thisAssetType ], function( thisAsset, nextAsset ) {
			thisAssetDstPath = path.join( this.outputDirectoryPath, path.relative( _this.path, thisAsset.srcPath ) );
			if( assetType === 'style' ) thisAssetDstPath = renameFileExtension( thisAssetDstPath, '.css' );

			thisAsset.writeToDisk( thisAssetDstPath, makeDirs, nextAsset );
		}, nextAssetType );
	}, callback );
};

Package.prototype.setDependencies = function( dependencies ) {
	this.dependencies = dependencies;
};

Package.prototype.addDependentParcel = function( parcel ) {
	if( this === parcel ) throw new Error( "A parcel should not be a dependent of itself." ); // this is an arbitrary call, but we enforce this just so we keep things straight and make sure we are consistent
	
	this.dependentParcels = _.union( this.dependentParcels, parcel );
};

Package.prototype.createAssetWatchers = function() {
	var _this = this;

	this.assetGlobWatchers = [];

	function emitAssetUpdatedEventOnRelevantParcels( eventType, asset ) {
		var allRelevantParcels = _this.dependentParcels;
		if( _this.isParcel ) allRelevantParcels.push( _this ); // we also want to trigger the same behavior on the parcel itself.

		allRelevantParcels.forEach( function( thisParcel ) {
			thisParcel.emit( 'assetUpdated', eventType, asset );
		} );
	}

	

	_.each( _this.assetGlobsByType, function( globs, thisAssetType ) {
		var thisWatcher = globwatcher( globs );

		thisWatcher.on( 'changed', function( srcPath ) {
			try {
				var asset = _.findWhere( _this.assetsByType[ thisAssetType ], { srcPath : srcPath } );
				if( ! asset ) throw new Error( 'Couldn\'t find changed file ' + srcPath + ' in assets of type ' + thisAssetType );

				emitAssetUpdatedEventOnRelevantParcels( 'changed', asset );
			} catch( err ) {
				return console.log( 'Watch error: ' + err );
			}
		} );

		thisWatcher.on( 'added', function( srcPath ) {
			try {
				var asset = _.findWhere( _this.assetsByType[ thisAssetType ], { srcPath : srcPath } );
				// watching is weird... sometimes we get double events. make sure we don't add the same asset twice.
				if( asset ) throw new Error( 'Asset ' + srcPath + ' already exists in assets of type ' + thisAssetType );
				
				asset = _this.createAsset( srcPath, thisAssetType );
				_this.assetsByType[ thisAssetType ].push( asset );

				emitAssetUpdatedEventOnRelevantParcels( 'added', asset );
			} catch( err ) {
				return console.log( 'Watch error: ' + err );
			}
		} );

		thisWatcher.on( 'deleted', function( srcPath ) {
			try {
				var asset = _.findWhere( _this.assetsByType[ thisAssetType ], { srcPath : srcPath } );
				if( ! asset ) throw new Error( 'Couldn\'t find changed file ' + srcPath + ' in assets of type ' + thisAssetType );

				_this.assetsByType[ thisAssetType ] = _.without( _this.assetsByType[ thisAssetType ], asset );
			
				emitAssetUpdatedEventOnRelevantParcels( 'deleted', asset );
			} catch( err ) {
				return console.log( 'Watch error: ' + err );
			}
		} );

		_this.assetGlobWatchers.push( thisWatcher );
	} );
};

function renameFileExtension( file, toExt ) {
	return file.replace( new RegExp( path.extname( file ) + "$" ), toExt );
}