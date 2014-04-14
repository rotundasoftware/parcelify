var path = require('path');
var browserify = require( 'browserify' );
var watchify = require( 'watchify' );
var parcelMap = require( 'parcel-map' );
var shasum = require( 'shasum' );
var through2 = require( 'through2' );
var path = require( 'path' );
var _ = require( 'underscore' );
var async = require( 'async' );
var glob = require( 'glob' );
var Package = require( './lib/package' );
var Parcel = require( './lib/parcel' );
var parcelFinder = require( 'parcel-finder' );
var inherits = require( 'inherits' );
var log = require( 'npmlog' );

var EventEmitter = require('events').EventEmitter;
var Package = require('./lib/package.js');

module.exports = Parcelify;

inherits( Parcelify, EventEmitter );

function Parcelify( mainPath, options ) {
	var _this = this;
	
	if( ! ( this instanceof Parcelify ) ) return new Parcelify( mainPath, options );

	options = _.defaults( {}, options, {
		bundles : {
			script : 'bundle.js',
			style : 'bundle.css'
			// template : 'bundle.tmpl'		// don't bundle templates by default.. against best-practices
		},

		appTranforms : [],
		appTranformDirs : [],

		packageTransform : undefined,
		
		watch : false,

		browserifyInstance : undefined,
		browserifyOptions : {},
		browserifyBundleOptions : {},

		// used internally or in order to share packages between multiple parcelify instances
		existingPackages : undefined
	} );

	this.mainPath = mainPath;
	this.watching = false;

	var browserifyInstance;

	// before we jump the gun, return from this function so we can listen to events from the calling function
	process.nextTick( function() {
		if( options.browserifyInstance ) browserifyInstance = options.browserifyInstance;
		else {
			var browserifyOptions = _.extend( {}, options.browserifyOptions, { entries : mainPath } );
			browserifyInstance = options.watch ? watchify( browserifyOptions ) : browserify( browserifyOptions );
			_this.emit( 'browserifyInstanceCreated', browserifyInstance );
		}

		var existingPackages = options.existingPackages || {};
		var mappedAssets = {};

		_this.on( 'error', function( err ) {
			log.error( '', err ); // otherwise errors kill our watch task. Especially bad for transform errors
		} );

		if( options.watch ) {
			browserifyInstance.on( 'update', _.debounce( function( changedMains ) {
				_this.watching = true;

				// if( _.contains( changedMains, _this.mainPath ) ) { // I think this should always be the case. nevermind, changeMains contains javascript files that have changed (?)
					var processParcelOptions = _.clone( options );
					processParcelOptions.existingPackages = existingPackages;
					processParcelOptions.mappedAssets = mappedAssets;

					_this.processParcel( browserifyInstance, processParcelOptions, function( err, parcel ) {
						if( err ) _this.emit( 'error', err );
					} );
				// }
			}, 1000, true ) );
		}

		var processParcelOptions = _.clone( options );
		processParcelOptions.existingPackages = existingPackages;
		processParcelOptions.mappedAssets = mappedAssets;

		_this.processParcel( browserifyInstance, processParcelOptions, function( err, parcel ) {
			if( err ) _this.emit( 'error', err );
		} );
	} );

	return _this;
}

Parcelify.prototype.processParcel = function( browserifyInstance, options, callback ) {
	var _this = this;
	var jsBundleContents;

	var existingPackages = options.existingPackages || {};
	var existingAssets = options.existingPackages || {};
	var assetTypes = _.without( Object.keys( options.bundles ), 'script' );
	var mainPath = this.mainPath;
	var mainParcelMap;
	var packageFilter;

	packageFilter = this._createBrowserifyPackageFilter( options.packageTransform, options.appTranforms, options.appTranformDirs );
	options.browserifyBundleOptions.packageFilter = packageFilter;

	var packages = _.reduce( existingAssets, function( memo, thisPackage, thisPackageId ) {
		memo[ thisPackage.path ] = thisPackage.package;
		return memo;
	}, [] );

	var parcelMapEmitter = parcelMap( browserifyInstance, {
		keys : assetTypes,
		files : options.mappedAssets,
		packages : packages,
		packageFilter : packageFilter
	} );

	async.parallel( [ function( nextParallel ) {
		parcelMapEmitter.on( 'error', function( err ) {
			return callback( err );
		} );

		parcelMapEmitter.on( 'done', function( res ) {
			mainParcelMap = res;
			nextParallel();
		} );
	}, function( nextParallel ) {
		browserifyInstance.bundle( options.browserifyBundleOptions, function( err, res ) {
			if( err ) return nextParallel( new Error( 'Error while browserifying "' + mainPath + '":' + err ) );

			jsBundleContents = res;
			nextParallel();
		} );
	} ], function( err ) {
		if( err ) return callback( err );

		_this.instantiateParcelAndPackagesFromMap( mainParcelMap, existingPackages, assetTypes, function( err, mainParcel, packagesThatWereCreated ) {
			if( err ) return callback( err );

			_this.mainParcel = mainParcel;

			mainParcel.setJsBundleContents( jsBundleContents );

			process.nextTick( function() {
				async.series( [ function( nextSeries ) {
					// fire package events for any new packages
					_.each( packagesThatWereCreated, function( thisPackage ) {
						var isMainParcel = thisPackage === mainParcel;

						existingPackages[ thisPackage.id ] = thisPackage;
						if( isMainParcel ) _this._setupParcelEventRelays( thisPackage );

						thisPackage.on( 'error', function( err ) {
							_this.emit( 'error', err );
						} );

						_this.emit( 'packageCreated', thisPackage, isMainParcel );
					} );

					nextSeries();
				}, function( nextSeries ) {
					// we are done copying packages and collecting our asset streams. Now write our bundles to disk.
					async.each( Object.keys( options.bundles ), function( thisAssetType, nextEach ) {
						var thisBundlePath = options.bundles[ thisAssetType ];
						if( ! thisBundlePath ) return nextEach();
					
						mainParcel.writeBundle( thisAssetType, thisBundlePath, function( err ) {
							// don't stop writing other bundles if there was an error on this one. errors happen
							// frequently with transforms.. like invalid scss, etc. don't stop the show, just 
							// keep going with our other bundles.

							if( err ) _this.emit( 'error', err );
							else _this.emit( 'bundleWritten', thisBundlePath, thisAssetType, _this.watching );

							nextEach();
						} );
					}, nextSeries );
				}, function( nextSeries ) {
					var mainParcelIsNew = _.contains( packagesThatWereCreated, mainParcel );
					if( options.watch ) {
						// we only create glob watchers for the packages that parcel added to the manifest. Again, we want to avoid doubling up
						// work in situations where we have multiple parcelify instances running that share common bundles
						_.each( packagesThatWereCreated, function( thisPackage ) { thisPackage.createWatchers( assetTypes, options.packageTransform ); } );
						if( mainParcelIsNew ) mainParcel.attachWatchListeners( options.bundles );
					}

					if( ! _this.watching ) _this.emit( 'done' );

					nextSeries();
				} ], callback );
			} );

			return callback( null, mainParcel ); // return this parcel to our calling function via the cb
		} );
	} );
};

Parcelify.prototype.instantiateParcelAndPackagesFromMap = function( parcelMap, existingPacakages, assetTypes, callback ) {
	var _this = this;
	var mappedParcel = null;
	var packagesThatWereCreated = {};

	async.series( [ function( nextSeries ) {
		async.each( Object.keys( parcelMap.packages ), function( thisPackageId, nextPackageId ) {
			var packageJson = parcelMap.packages[ thisPackageId ];
			var packageOptions = {};

			async.waterfall( [ function( nextWaterfall ) {
				Package.getOptionsFromPackageJson( thisPackageId, packageJson.__path, packageJson, assetTypes, nextWaterfall );
			}, function( packageOptions, nextWaterfall ) {
				var thisPackage;

				var thisIsTheTopLevelParcel = packageJson.__isMain;
				var thisPackageIsAParcel = thisIsTheTopLevelParcel || parcelFinder.isParcel( packageJson, packageJson.__path );

				if( ! existingPacakages[ thisPackageId ] ) {
					if( thisPackageIsAParcel ) {
						if( thisIsTheTopLevelParcel ) {
							packageOptions.mainPath = _this.mainPath;
						}

						thisPackage = packagesThatWereCreated[ thisPackageId ] = new Parcel( packageOptions );
					}
					else thisPackage = packagesThatWereCreated[ thisPackageId ] = new Package( packageOptions );

					thisPackage.createAllAssets( assetTypes );
				}
				else
					thisPackage = existingPacakages[ thisPackageId ];

				if( thisIsTheTopLevelParcel ) mappedParcel = thisPackage;

				nextWaterfall();
			} ], nextPackageId );
		}, nextSeries );
	}, function( nextSeries ) {
		if( ! mappedParcel ) return callback( new Error( 'Could not locate this mapped parcel id.' ) );

		var allPackages = _.extend( {}, existingPacakages, packagesThatWereCreated );

		// now that we have all our packages instantiated, hook up dependencies
		_.each( parcelMap.dependencies, function( dependencyIds, thisPackageId ) {
			var thisPackage = allPackages[ thisPackageId ];
			var thisPackageDependencies = _.map( dependencyIds, function( thisDependencyId ) { return allPackages[ thisDependencyId ]; } );
			thisPackage.setDependencies( thisPackageDependencies );
		} );

		// finally, we can calculate the topo sort of all the dependencies and assets in the parcel
		mappedParcel.calcSortedDependencies();
		mappedParcel.calcParcelAssets( assetTypes );

		_.each( mappedParcel.sortedDependencies, function( thisPackage ) {
			thisPackage.addDependentParcel( mappedParcel );
		} );

		nextSeries();
	} ], function( err ) {
		return callback( err, mappedParcel, packagesThatWereCreated );
	} );
};

Parcelify.prototype._setupParcelEventRelays = function( parcel ) {
	var _this = this;
	var eventsToRelay = [ 'assetUpdated', 'packageJsonUpdated' ];

	eventsToRelay.forEach( function( thisEvent ) {
		parcel.on( thisEvent, function() {
			var args = Array.prototype.slice.call( arguments );
			_this.emit.apply( _this, [].concat( thisEvent, args ) );
		} );
	} );

	parcel.on( 'bundleUpdated', function( path, assetType ) {
		_this.emit( 'bundleWritten', path, assetType, true );
	} );
};


Parcelify.prototype._createBrowserifyPackageFilter = function( existingPackageFilter, appTranforms, appTranformDirs ) {
	var packageFilter = existingPackageFilter;

	if( ! packageFilter ) packageFilter = function( pkg ){ return pkg; };

	function applyDefaultTransforms( pkg, path ) {
		if( appTranforms ) {
			var pkgIsInAppTranformsDir = path.resolve( appTranformDirs, path ) !== path;
			pkg.transforms = appTranforms.concat( pkg.tranforms || [] );
		}

		return pkg;
	}

	// make another transform that curries the browserify transforms to our generalized transform key
	function curryTranformsToBrowserify( pkg ) {
		if( pkg.transforms && _.isArray( pkg.transforms ) ) {
			if( ! pkg.browserify ) pkg.browserify = {};
			if( ! pkg.browserify.transform ) pkg.browserify.transform = [];

			pkg.browserify.transform = pkg.transforms.concat( pkg.browserify.transform );
		}

		return pkg;
	}

	return _.compose( curryTranformsToBrowserify, applyDefaultTransforms, packageFilter );
};
