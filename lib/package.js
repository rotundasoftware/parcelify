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
var log = require( 'npmlog' );

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
	this.assetsByType = {};

	EventEmitter.call( this );
}

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
	var thisAsset = new Asset( thisAssetSrcPath, assetType, _.clone( this.assetTransformsByType[ assetType ] ) );

	log.verbose( '', assetType + ' asset registered "%s"', path.relative( process.cwd(), thisAssetSrcPath ) );

	return thisAsset;
};

Package.prototype.getAssets = function( types ) {
	return _.reduce( this.assetsByType, function( memo, assetsOfThisType, thisAssetType ) {
		if( types && ! _.contains( types, thisAssetType ) ) return memo;

		return memo.concat( assetsOfThisType );
	}, [] );
};

Package.prototype.addTransform = function( transform, transformOptions, toAssetTypes ) {
	var t = transformOptions ? function( file ) { return transform( file, transformOptions ); } : transform;

	toAssetTypes = toAssetTypes || Object.keys( this.assetsByType );
	if( ! _.isArray( toAssetTypes ) ) toAssetTypes = [ toAssetTypes ];

	// add transform to existing assets
	this.getAssets( toAssetTypes ).forEach( function( thisAsset ) {
		thisAsset.addTransform( t );
	} );

	// and also add it to the package itself so it is added to assets created from this point forward
	_.each( _.pick( this.assetTransformsByType, toAssetTypes ), function( transformsForThisAssetType ) {
		transformsForThisAssetType.push( t );
	} );
};

Package.prototype.setDependencies = function( dependencies ) {
	this.dependencies = dependencies;
};

Package.prototype.addDependentParcel = function( parcel ) {
	this.dependentParcels = _.union( this.dependentParcels, parcel );
};

Package.prototype.createWatchers = function( assetTypes, packageFilter, appTransforms, appTransformDirs ) {
	this._createPackageJsonWatcher( assetTypes, packageFilter, appTransforms, appTransformDirs );
	this._createAssetGlobWatchers();
};

Package.prototype.destroy = function() {
	this._destroyAssetGlobWatchers();
	this.assetJsonWatcher.close();
};

/********************* Private instance methods *********************/

Package.prototype._createPackageJsonWatcher = function( assetTypes, packageFilter, appTransforms, appTransformDirs ) {
	var _this = this;

	this.assetJsonWatcher = globwatcher( path.resolve( this.path, "package.json" ) );
	this.assetJsonWatcher.on( 'changed', function( srcPath ) {
		log.info( 'watch', 'package.json changed "%s"', path.relative( process.cwd(), srcPath ) );

		fs.readFile( srcPath, 'utf8', function( err, packageJson ) {
			if( err ) return _this.emit( 'error', err );

			try {
				packageJson = JSON.parse( packageJson );
			} catch( err ) {
				return _this.emit( 'error', new Error( 'While parsing "' + srcPath + '", ' + err ) );
			}

			packageJson.__path = _this.path;

			if( packageFilter ) packageJson = packageFilter( packageJson, _this.path );

			Package.getOptionsFromPackageJson( _this.id, _this.path, packageJson, assetTypes, appTransforms, appTransformDirs, function( err, options ) {
				if( err ) return _this.emit( 'error', err );

				_.extend( _this, options );

				_this.createAllAssets( assetTypes );

				_this._destroyAssetGlobWatchers();
				_this._createAssetGlobWatchers();

				_this._emitEventOnRelevantParcels( 'packageJsonUpdated', _this );
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
				log.info( 'watch', '"%s" changed', path.relative( process.cwd(), srcPath ) );

				var asset = _.findWhere( _this.assetsByType[ thisAssetType ], { srcPath : srcPath } );
				if( ! asset ) return _this.emit( 'error', new Error( 'Couldn\'t find changed file ' + srcPath + ' in assets of type ' + thisAssetType ) );

				_this._emitEventOnRelevantParcels( 'assetUpdated', 'changed', asset, _this );
			} catch( err ) {
				return _this.emit( 'error', err );
			}
		} );

		thisWatcher.on( 'added', function( srcPath ) {
			try {
				log.info( 'watch', '"%s" added', path.relative( process.cwd(), srcPath ) );
			
				var asset = _.findWhere( _this.assetsByType[ thisAssetType ], { srcPath : srcPath } );
				// watching is weird... sometimes we get double events. make sure we don't add the same asset twice.
				if( asset ) return _this.emit( 'error', new Error( 'Asset ' + srcPath + ' already exists in assets of type ' + thisAssetType ) );
				
				asset = _this.createAsset( srcPath, thisAssetType );
				_this.assetsByType[ thisAssetType ].push( asset );

				_this._emitEventOnRelevantParcels( 'assetUpdated', 'added', asset, _this );
			} catch( err ) {
				return _this.emit( 'error', err );
			}
		} );

		thisWatcher.on( 'deleted', function( srcPath ) {
			try {
				log.info( 'watch', '"%s" deleted', path.relative( process.cwd(), srcPath ) );

				var asset = _.findWhere( _this.assetsByType[ thisAssetType ], { srcPath : srcPath } );
				if( ! asset ) return _this.emit( 'error', new Error( 'Couldn\'t find changed file ' + srcPath + ' in assets of type ' + thisAssetType ) );

				_this.assetsByType[ thisAssetType ] = _.without( _this.assetsByType[ thisAssetType ], asset );
			
				_this._emitEventOnRelevantParcels( 'assetUpdated', 'deleted', asset, _this );
			} catch( err ) {
				return _this.emit( 'error', err );
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

	this.dependentParcels.forEach( function( thisParcel ) {
		thisParcel.emit.apply( thisParcel, args );
	} );
};

/********************* Static class methods *********************/

Package.getOptionsFromPackageJson = function( packageId, packagePath, packageJson, assetTypes, appTransforms, appTransformDirs, callback ) {
	var packageOptions = {};

	if( appTransforms ) {
		var pkgIsInAppTransformsDir = _.find( appTransformDirs, function( thisAppDirPath ) {
			var relPath = path.relative( thisAppDirPath, packagePath );
			var needToBackup = relPath.charAt( 0 ) === '.' && relPath.charAt( 1 ) === '.';
			var appTransformsApplyToThisDir = ! needToBackup && relPath.indexOf( 'node_modules' ) === -1;
			return appTransformsApplyToThisDir;
		} );

		if( pkgIsInAppTransformsDir )
			packageJson.transforms = appTransforms.concat( packageJson.transforms || [] );
	}

	packageOptions.package = packageJson;
	packageOptions.id = packageId;
	packageOptions.path = packagePath;

	packageOptions.assetSrcPathsByType = {};
	packageOptions.assetTransformsByType = {};
	packageOptions.assetGlobsByType = {};

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
			// resolve transform names to actual transform
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
				if( _.isFunction( thisTransformName ) ) return nextTransform( null, thisTransformName );

				resolve( thisTransformName, { basedir : packageJson.__path }, function( err, modulePath ) {
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


function applyAppTransforms( pkg, dirPath, appTransformDirs ) {
	

	return pkg;
}

