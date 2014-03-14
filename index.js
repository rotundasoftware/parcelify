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
var resolve = require( 'resolve' );
var Package = require( './lib/package' );
var Parcel = require( './lib/parcel' );
var resolve = require( 'resolve' );
var inherits = require( 'inherits' );

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
			//template : 'bundle.tmpl'
		},

		watch : false,
		browserifyInstance : undefined,
		browserifyBundleOptions : {},

		// used internally or in order to share packages between multiple parcelify instances
		existingPackages : undefined
	} );

	this.mainPath = mainPath;

	var browerifyInstance;

	if( options.browserifyInstance ) browerifyInstance = options.browerifyInstance;
	else {
		browerifyInstance = options.watch ? watchify( mainPath ) : browserify( mainPath );
		_this.emit( 'browerifyInstanceCreated', browerifyInstance );
	}

	var existingPackages = options.existingPackages || {};

	_this.on( 'packageCreated', function( thisPackage, isMainParcel ) {
		existingPackages[ thisPackage.id ] = thisPackage;
		if( isMainParcel )
			_this._setupParcelEventRelays( thisPackage );
	} );

	if( options.watch ) {
		browerifyInstance.on( 'update', _.debounce( function( changedMains ) {
			if( _.contains( changedMains, _this.mainPath ) ) { // I think this should always be the case
				var newOptions = _.clone( options );
				newOptions.existingPackages = existingPackages;

				_this.processParcel( browerifyInstance, newOptions, function( err, parcel ) {
					if( err ) return _this.emit( 'error', err );
				} );
			}
		}, 1000, true ) );
	}

	_this.processParcel( browerifyInstance, options, function( err, parcel ) {
		if( err ) return _this.emit( 'error', err );
	} );

	return _this;
}

Parcelify.prototype.processParcel = function( browerifyInstance, options, callback ) {
	var _this = this;
	var jsBundleStream;

	var existingPackages = options.existingPackages || {};
	var assetTypes = _.without( Object.keys( options.bundles ), 'script' );
	var mainPath = this.mainPath;

	parcelMap( browerifyInstance, { keys : assetTypes }, function( err, parcelMap ) {
		if( err ) return callback( err );
		
		_this.instantiateParcelAndPackagesFromMap( parcelMap, existingPackages, assetTypes, function( err, mainParcel, packagesThatWereCreated ) {
			if( err ) return callback( err );

			_this.mainParcel = mainParcel;

			mainParcel.setJsBundleStream( jsBundleStream );

			process.nextTick( function() {
				async.series( [ function( nextSeries ) {
					// fire package events for any new packages
					_.each( packagesThatWereCreated, function( thisPackage ) { _this.emit( 'packageCreated', thisPackage, thisPackage === mainParcel ); } );

					nextSeries();
				}, function( nextSeries ) {
					// we are done copying packages and collecting our asset streams. Now write our bundles to disk.
					mainParcel.writeBundles( options.bundles, nextSeries );
				}, function( nextSeries ) {
					var mainParcelIsNew = _.contains( packagesThatWereCreated, mainParcel );

					if( options.watch ) {
						// we only create glob watchers for the packages that parcel added to the manifest. Again, we want to avoid doubling up
						// work in situations where we have multiple parcelify instances running that share common bundles
						_.each( packagesThatWereCreated, function( thisPackage ) { thisPackage.createWatchers( assetTypes ); } );
						if( mainParcelIsNew ) mainParcel.attachWatchListeners( options.bundles );
					}

					if( mainParcelIsNew ) _this.emit( 'done' );

					nextSeries();
				} ] );
			} );

			return callback( null, mainParcel ); // return this parcel to our calling function via the cb
		} );
	} );
	
	// get things moving. note we need to do this after parcelMap has been called with the browserify instance
	jsBundleStream = browerifyInstance.bundle( options.browserifyBundleOptions ).pipe( through2() );
};

Parcelify.prototype.instantiateParcelAndPackagesFromMap = function( parcelMap, existingPacakages, assetTypes, callback ) {
	var _this = this;
	var mappedParcel = null;
	var packagesThatWereCreated = {};
	var pathOfMappedParcel = path.dirname( this.mainPath );
	var thisIsTheTopLevelParcel;

	async.series( [ function( nextSeries ) {
		async.each( Object.keys( parcelMap.packages ), function( thisPackageId, nextPackageId ) {
			var packageOptions = {};

			async.waterfall( [ function( nextWaterfall ) {
				var packageJson = parcelMap.packages[ thisPackageId ];
				Package.getOptionsFromPackageJson( thisPackageId, packageJson.__dirname, packageJson, assetTypes, nextWaterfall );
			}, function( packageOptions, nextWaterfall ) {
				var thisPackage;

				thisIsTheTopLevelParcel = packageOptions.path === pathOfMappedParcel;

				if( ! existingPacakages[ thisPackageId ] ) {
					if( packageOptions.isParcel ) {
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

		var allPackagesRelevantToThisParcel = _.extend( existingPacakages, packagesThatWereCreated );

		// now that we have all our packages instantiated, hook up dependencies
		_.each( parcelMap.dependencies, function( dependencyIds, thisPackageId ) {
			var thisPackage = allPackagesRelevantToThisParcel[ thisPackageId ];
			var thisPackageDependencies = _.map( dependencyIds, function( thisDependencyId ) { return allPackagesRelevantToThisParcel[ thisDependencyId ]; } );
			thisPackage.setDependencies( thisPackageDependencies );
		} );

		_.each( allPackagesRelevantToThisParcel, function( thisPackage ) {
			if( thisPackage === mappedParcel ) return; // debatable whether or not it makes sense semantically to include a parcel as a dependent of itself.

			thisPackage.addDependentParcel( mappedParcel );
		} );

		// finally, we can calculate the topo sort of all the dependencies and assets in the parcel
		mappedParcel.calcSortedDependencies();
		mappedParcel.calcParcelAssets( assetTypes );

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
};