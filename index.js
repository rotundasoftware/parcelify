var path = require('path');
var parcelMap = require( 'parcel-map' );
var shasum = require( 'shasum' );
var through2 = require( 'through2' );
var path = require( 'path' );
var _ = require( 'underscore' );
var async = require( 'async' );
var glob = require( 'glob' );
var Package = require( './lib/package' );
var Parcel = require( './lib/parcel' );
var inherits = require( 'inherits' );
var log = require( 'npmlog' );

var EventEmitter = require('events').EventEmitter;
var Package = require('./lib/package.js');

module.exports = Parcelify;

inherits( Parcelify, EventEmitter );

function Parcelify( browserifyInstance, options ) {
	var _this = this;
	
	if( ! ( this instanceof Parcelify ) ) return new Parcelify( browserifyInstance, options );

	options = _.defaults( {}, options, {
		bundles : {},						// ignored when bundlesByEntryPoint is provided
		bundlesByEntryPoint : undefined,	// required when there are multiple entry points

		appTransforms : undefined,
		appTransformDirs : undefined,
		
		watch : undefined,
		logLevel : undefined,

		// used internally or in order to share packages between multiple parcelify instances
		existingPackages : undefined
	} );

	// option aliases
	if( _.isUndefined( options.bundles.style ) ) options.bundles.style = options.o || 'bundle.css';
	if( _.isUndefined( options.appTransforms ) ) options.appTransforms = options.t || [];
	if( _.isUndefined( options.appTransformDirs ) ) options.appTransformDirs = options.d || [];
	if( _.isUndefined( options.watch ) ) options.watch = options.w || false;
	if( _.isUndefined( options.logLevel ) ) options.logLevel = options.l;

	if( _.isString( options.appTransforms ) ) options.appTransforms = [ options.appTransforms ];

	this.watching = false;

	if( options.logLevel ) log.level = options.logLevel;

	// before we jump the gun, return from this function so we can listen to events from the calling function
	process.nextTick( function() {
		var existingPackages = options.existingPackages || {};
		var mappedAssets = {};

		_this.on( 'error', function( err ) {
			log.error( '', err ); // otherwise errors kill our watch task. Especially bad for transform errors
		} );

		if( options.watch ) {
			browserifyInstance.on( 'update', _.debounce( function( changedMains ) {
				_this.watching = true;

				var processParcelOptions = _.clone( options );
				processParcelOptions.existingPackages = existingPackages;
				processParcelOptions.mappedAssets = mappedAssets;

				_this.processParcels( browserifyInstance, processParcelOptions, function( err ) {
					if( err ) _this.emit( 'error', err );
				} );
			}, 1000, true ) );
		}

		var processParcelOptions = _.clone( options );
		processParcelOptions.existingPackages = existingPackages;
		processParcelOptions.mappedAssets = mappedAssets;

		_this.processParcels( browserifyInstance, processParcelOptions, function( err ) {
			if( err ) _this.emit( 'error', err );
		} );
	} );

	return _this;
}

Parcelify.prototype.processParcels = function( browserifyInstance, options, callback ) {
	var _this = this;

	var existingPackages = options.existingPackages || {};
	var assetTypes;

	if( options.bundlesByEntryPoint ) {
		assetTypes = _.reduce( options.bundlesByEntryPoint, function( assetTypesMemo, bundlesForThisEntryPoint ) {
			return _.union( assetTypesMemo, _.keys( bundlesForThisEntryPoint ) );
		}, [] )
	} else assetTypes = _.keys( options.bundles );
	
	var packages = _.reduce( existingPackages, function( memo, thisPackage, thisPackageId ) {
		memo[ thisPackage.path ] = thisPackage.package;
		return memo;
	}, {} );

	var dependencies = _.reduce( existingPackages, function( memo, thisPackage, thisPackageId ) {
		memo[ thisPackage.path ] = _.map( thisPackage.dependencies, function( thisDependency ) { return thisDependency.path; } );
		return memo;
	}, {} );

	var parcelMapEmitter = parcelMap( browserifyInstance, {
		keys : assetTypes,
		files : options.mappedAssets,
		packages : packages,
		dependencies : dependencies
	} );

	parcelMapEmitter.on( 'error', function( err ) {
		return callback( err );
	} );

	parcelMapEmitter.on( 'done', function( parcelMapResult ) {
		_this.instantiateParcelAndPackagesFromMap( parcelMapResult, existingPackages, assetTypes, options.appTransforms, options.appTransformDirs, function( err, packagesThatWereCreated ) {
			if( err ) return callback( err );

			var parcelsThatWereCreated = [];

			process.nextTick( function() {
				async.series( [ function( nextSeries ) {
					// fire package events for any new packages
					_.each( packagesThatWereCreated, function( thisPackage ) {
						var isParcel = thisPackage.isParcel;

						log.verbose( 'Created new ' + ( isParcel ? 'parcel' : 'package' ) + ' ' + thisPackage.path + ' with id ' + thisPackage.id );

						existingPackages[ thisPackage.id ] = thisPackage;
						if( isParcel ) {
							_this._setupParcelEventRelays( thisPackage );
							parcelsThatWereCreated.push( thisPackage );
						}

						thisPackage.on( 'error', function( err ) {
							_this.emit( 'error', err );
						} );

						_this.emit( 'packageCreated', thisPackage );
					} );

					nextSeries();
				}, function( nextSeries ) {
					if( parcelsThatWereCreated.length > 1 && ! options.bundlesByEntryPoint ) {
						return nextSeries( new Error( 'Multiple entry points detected, but bundlesByEntryPoint option was not supplied.' ) );
					}

					if( parcelsThatWereCreated.length === 1 && ! options.bundlesByEntryPoint ) {
						options.bundlesByEntryPoint = {};
						options.bundlesByEntryPoint[ _.first( parcelsThatWereCreated ).mainPath ] = options.bundles;
					}

					// we are done copying packages and collecting our asset streams. Now write our bundles to disk.
					async.each( _.values( packagesThatWereCreated ), function( thisParcel, nextEach ) {
						if( ! thisParcel.isParcel ) return nextEach();

						var thisParcelBundles = options.bundlesByEntryPoint[ thisParcel.mainPath ];
					
						async.each( Object.keys( thisParcelBundles ), function( thisAssetType, nextEach ) {
							var thisBundlePath = thisParcelBundles[ thisAssetType ];
							if( ! thisBundlePath ) return nextEach();

							thisParcel.writeBundle( thisAssetType, thisBundlePath, function( err, bundleWasWritten ) {
								// don't stop writing other bundles if there was an error on this one. errors happen
								// frequently with transforms.. like invalid scss, etc. don't stop the show, just 
								// keep going with our other bundles.

								if( err ) _this.emit( 'error', err );
								else if( bundleWasWritten ) _this.emit( 'bundleWritten', thisBundlePath, thisAssetType, thisParcel, _this.watching );

								nextEach();
							} );
						}, nextEach );
					}, nextSeries );
				}, function( nextSeries ) {
					if( options.watch ) {
						// we only create glob watchers for the packages that parcel added to the manifest. Again, we want to avoid doubling up
						// work in situations where we have multiple parcelify instances running that share common bundles
						_.each( packagesThatWereCreated, function( thisPackage ) {
							thisPackage.createWatchers( assetTypes, browserifyInstance._options.packageFilter, options.appTransforms, options.appTransformDirs );
							if( thisPackage.isParcel ) {
								thisPackage.attachWatchListeners( options.bundlesByEntryPoint[ thisPackage.mainPath ] );
							}
						} );
					}

					if( ! _this.watching ) _this.emit( 'done' );

					nextSeries();
				} ], callback );
			} );

			return callback( null );
		} );
	} );
};

Parcelify.prototype.instantiateParcelAndPackagesFromMap = function( parcelMapResult, existingPacakages, assetTypes, appTransforms, appTransformDirs, callback ) {
	var _this = this;
	var mappedParcel = null;
	var packagesThatWereCreated = {};

	async.series( [ function( nextSeries ) {
		async.each( Object.keys( parcelMapResult.packages ), function( thisPackageId, nextPackageId ) {
			var packageJson = parcelMapResult.packages[ thisPackageId ];
			var packageOptions = {};

			async.waterfall( [ function( nextWaterfall ) {
				Package.getOptionsFromPackageJson( thisPackageId, packageJson.__path, packageJson, assetTypes, appTransforms, appTransformDirs, nextWaterfall );
			}, function( packageOptions, nextWaterfall ) {
				var thisPackage;

				var thisPackageIsAParcel = packageJson.__isParcel;

				if( ! existingPacakages[ thisPackageId ] ) {
					if( thisPackageIsAParcel ) {
						thisPackage = packagesThatWereCreated[ thisPackageId ] = new Parcel( _.extend( packageOptions, { mainPath : packageJson.__mainPath } ) );
					}
					else thisPackage = packagesThatWereCreated[ thisPackageId ] = new Package( packageOptions );

					thisPackage.createAllAssets( assetTypes );
				}
				else if( thisPackageIsAParcel && ! existingPacakages[ thisPackageId ] instanceof Parcel ) {
					// k tricky here.. if this package is a parcel, but it exists in the manifest as a plain
					// old package, then we gotta recreate this package as a parcel. also we have to update
					// any parcels that are dependENTS of this package/parcel in order to use the new
					// assets that we are about to create. man, scary, hope nothing gets broke in the process.
					// we could also pre-preemptively list out which packages are parcels by adding an option
					// to parcelify itself, but that seems a little weird. In the context of cartero that
					// depends on the path of each package relative to the parcelDirs cartero option.
					var oldPackage = existingPacakages[ thisPackageId ];
					var oldDependentParcels = oldPackage.dependentParcels;

					oldPackage.destroy();

					thisPackage = packagesThatWereCreated[ thisPackageId ] = new Parcel( packageOptions );
					thisPackage.createAllAssets( assetTypes );

					oldDependentParcels.forEach( function( thisDependentParcel ) {
						thisPackage.addDependentParcel( thisDependentParcel );
						thisDependentParcel.calcSortedDependencies();
						thisDependentParcel.calcParcelAssets( assetTypes );
					} );

					log.warn( '', 'Recreated package at ' + thisPackage.path + ' as Parcel.' );
				} else
					thisPackage = existingPacakages[ thisPackageId ];

				nextWaterfall();
			} ], nextPackageId );
		}, nextSeries );
	}, function( nextSeries ) {
		var allPackages = _.extend( {}, existingPacakages, packagesThatWereCreated );

		// now that we have all our packages instantiated, hook up dependencies
		_.each( parcelMapResult.dependencies, function( dependencyIds, thisPackageId ) {
			var thisPackage = allPackages[ thisPackageId ];

			if( ! thisPackage ) return nextSeries( new Error( 'Unknown package id in dependency ' + thisPackageId ) );

			var thisPackageDependencies = _.map( dependencyIds, function( thisDependencyId ) { return allPackages[ thisDependencyId ]; } );
			thisPackage.setDependencies( thisPackageDependencies );
		} );

		// finally, we can calculate the topo sort of any parcels that were created
		_.each( packagesThatWereCreated, function( thisParcel ) {
			if( thisParcel.isParcel ) {
				thisParcel.calcSortedDependencies();
				thisParcel.calcParcelAssets( assetTypes );

				_.each( thisParcel.sortedDependencies, function( thisDependentPackage ) {
					thisDependentPackage.addDependentParcel( thisParcel );
				} );
			}
		} );

		nextSeries();
	} ], function( err ) {
		return callback( err, packagesThatWereCreated );
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

	parcel.on( 'bundleUpdated', function( bundlePath, assetType ) {
		_this.emit( 'bundleWritten', bundlePath, assetType, parcel, true );
	} );
};