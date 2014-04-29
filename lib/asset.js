var fs = require( 'fs' );
var async = require( 'async' );
var mkdirp = require( 'mkdirp' );
var combine = require( 'stream-combiner' );
var path = require( 'path' );
var _ = require( 'underscore' );

module.exports = Asset;

function Asset( srcPath, type, transforms ) {
	this.srcPath = srcPath;
	this.type = type;
	this.transforms = transforms;
}

Asset.prototype.addTransform = function( transform, transformOptions ) {
	var t = transformOptions ? function( file ) { return transform( file, transformOptions ); } : transform;
	this.transforms.push( t );
};

Asset.prototype.createReadStream = function() {
	var stream = fs.createReadStream( this.srcPath );
	return this._applyTransforms( stream, this.transforms );
};

Asset.prototype.writeToDisk = function( dstPath, callback ) {
	var _this = this;

	this.dstPath = dstPath; // save this for later

	async.series( [ function( nextSeries ) {
		mkdirp( path.dirname( dstPath ), nextSeries );
	}, function( nextSeries ) {
		var stream = _this.createReadStream();
		stream.on( 'error', function( err ) {
			nextSeries( new Error( 'While reading or transforming "' + _this.srcPath + '":\n' + err.message ) );
		} );
		stream.on( 'end', nextSeries );
		stream.pipe( fs.createWriteStream( dstPath ) );
	} ], callback );
};

Asset.prototype._applyTransforms = function( stream, transforms ) {
	var _this = this;

	if( ! transforms || transforms.length === 0 ) return stream;

	var combinedStream = combine.apply( null, transforms.map( function( thisTransform ) {
		return thisTransform( _this.srcPath );
	} ) );

	return stream.pipe( combinedStream );
};
