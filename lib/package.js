var path = require('path');
var fs = require( 'fs' );
var inherits = require( 'inherits' );
var EventEmitter = require( 'events' ).EventEmitter;
var _ = require( 'underscore' );
var async = require( 'async' );
var glob = require( 'glob' );
var globwatcher = require( 'globwatcher' ).globwatcher;
var Asset = require( './asset' );
var resolve = require( 'resolve' );

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

Package.prototype.createWatchers = function( assetTypes ) {
	this._createPackageJsonWatcher( assetTypes );
	this._createAssetGlobWatchers();
};

/********************* Private instance methods *********************/

Package.prototype._createPackageJsonWatcher = function( assetTypes ) {
	var _this = this;

	var assetJsonWatcher = globwatcher( path.resolve( this.path, "package.json" ) );
	assetJsonWatcher.on( 'changed', function( srcPath ) {
		fs.readFile( srcPath, 'utf8', function( err, packageJson ) {
			if( err ) return console.log( 'Watch error: ' + err );

			try {
				packageJson = JSON.parse( packageJson );
			} catch( err ) {
				return console.log( 'Watch error: ' + err );
			}

			Package.getOptionsFromPackageJson( _this.packageId, _this.path, packageJson, assetTypes, function( err, options ) {
				if( err ) return console.log( 'Watch error: ' + err );

				_.extend( _this, options );

				_this.createAllAssets( assetTypes );

				_this._destroyAssetGlobWatchers();
				_this._createAssetGlobWatchers();

				_this._emitEventOnRelevantParcels( 'packageJsonUpdated' );
			} );
		} );
	} );
};

Package.prototype._createAssetGlobWatchers = function() {
	var _this = this;

	this.assetGlobWatchers = [];

	_.each( _this.assetGlobsByType, function( globs, thisAssetType ) {
		var thisWatcher = globwatcher( globs );

		thisWatcher.on( 'changed', function( srcPath ) {
			try {
				var asset = _.findWhere( _this.assetsByType[ thisAssetType ], { srcPath : srcPath } );
				if( ! asset ) throw new Error( 'Couldn\'t find changed file ' + srcPath + ' in assets of type ' + thisAssetType );

				_this._emitEventOnRelevantParcels( 'assetUpdated', 'changed', asset );
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

				_this._emitEventOnRelevantParcels( 'assetUpdated', 'added', asset );
			} catch( err ) {
				return console.log( 'Watch error: ' + err );
			}
		} );

		thisWatcher.on( 'deleted', function( srcPath ) {
			try {
				var asset = _.findWhere( _this.assetsByType[ thisAssetType ], { srcPath : srcPath } );
				if( ! asset ) throw new Error( 'Couldn\'t find changed file ' + srcPath + ' in assets of type ' + thisAssetType );

				_this.assetsByType[ thisAssetType ] = _.without( _this.assetsByType[ thisAssetType ], asset );
			
				_this._emitEventOnRelevantParcels( 'assetUpdated', 'deleted', asset );
			} catch( err ) {
				return console.log( 'Watch error: ' + err );
			}
		} );

		_this.assetGlobWatchers.push( thisWatcher );
	} );
};

Package.prototype._destroyAssetGlobWatchers = function() {
	this.assetGlobWatchers.forEach( function( thisAssetGlobWatcher ) {
		thisAssetGlobWatcher.close();
	} );

	this.assetGlobWatchers = [];
};

Package.prototype._emitEventOnRelevantParcels = function() {
	var args = Array.prototype.slice.call( arguments );

	var allRelevantParcels = this.dependentParcels;
	if( this.isParcel ) allRelevantParcels.push( this ); // we also want to trigger the same behavior on the parcel itself.

	allRelevantParcels.forEach( function( thisParcel ) {
		thisParcel.emit.apply( thisParcel, args );
	} );
};

/********************* Static class methods *********************/

Package.getOptionsFromPackageJson = function( packageId, packagePath, packageJson, assetTypes, callback ) {
	var packageOptions = {};

	packageOptions.package = packageJson;
	packageOptions.id = packageId;
	packageOptions.path = packagePath;

	packageOptions.assetSrcPathsByType = {};
	packageOptions.assetTransformsByType = {};
	packageOptions.assetGlobsByType = {};

	if( packageJson.view ) {
		packageOptions.view = path.resolve( packageOptions.path, packageJson.view );
		packageOptions.isParcel = true;
	}

	async.each( assetTypes, function( thisAssetType, nextAssetType ) {

		async.parallel( [ function( nextParallel ) {
			packageOptions.assetSrcPathsByType[ thisAssetType ] = [];

			// resolve relative globs to absolute globs
			var relativeGlobsOfThisType = packageJson[ thisAssetType ] || [];
			if( _.isString( relativeGlobsOfThisType ) ) relativeGlobsOfThisType = [ relativeGlobsOfThisType ];
			var absoluteGlobsOfThisType = relativeGlobsOfThisType.map( function( thisGlob ) { return path.resolve( packagePath, thisGlob ); } );
			packageOptions.assetGlobsByType[ thisAssetType ] = absoluteGlobsOfThisType;

			// resolve absolute globs to actual src files
			async.map( absoluteGlobsOfThisType, glob,
			function( err, arrayOfResolvedGlobs ) {
				if( err ) return nextParallel( err );

				var assetsOfThisType = _.flatten( arrayOfResolvedGlobs );
				packageOptions.assetSrcPathsByType[ thisAssetType ] = assetsOfThisType;

				nextParallel();
			} );
		}, function( nextParallel ) {
			// resolve transform names to actual tranforms
			packageOptions.assetTransformsByType[ thisAssetType ] = [];

			if( packageJson.transforms ) {
				if( _.isArray( packageJson.transforms ) )
					transformNames = packageJson.transforms;
				else
					transformNames = packageJson.transforms[ thisAssetType ] || [];
			}
			else
				transformNames = [];

			async.map( transformNames, function( thisTransformName, nextTransform ) {
				resolve( thisTransformName, { basedir : packageJson.__dirname }, function( err, modulePath ) {
					if( err ) return nextTransform( err );

					nextTransform( null, require( modulePath ) );
				} );
			}, function( err, transforms ) {
				if( err ) return nextParallel( err );

				packageOptions.assetTransformsByType[ thisAssetType ] = transforms;
				nextParallel();
			} );
		} ], nextAssetType );
	}, function( err ) {
		if( err ) return callback( err );

		callback( null, packageOptions );
	} );
};

/********************* Utility functions *********************/

function renameFileExtension( file, toExt ) {
	return file.replace( new RegExp( path.extname( file ) + "$" ), toExt );
}