var fs = require( 'fs' );
var resolve = require( 'resolve' );
var async = require( 'async' );
var mkdirp = require( 'mkdirp' );
var combine = require( "stream-combiner" );
var path = require( "path" );

module.exports = Asset;

function Asset( srcPath, dstPath, type, transforms ) {
	this.srcPath = srcPath;
	this.dstPath = dstPath;
	this.type = type;
	this.transforms = transforms;
	this.streamSpent = false;

	this.createStream();
}

Asset.prototype.createStream = function() {
	this.stream = fs.createReadStream( this.srcPath );
	this._applyTransforms( this.transforms );
	this.streamSpent = false;
};

Asset.prototype.writeStreamToDisk = function( dstPath, makeDir, callback ) {
	this.dstPath = dstPath;

	async.series( [ function( nextSeries ) {
		if( ! makeDir ) return nextSeries();

		mkdirp( path.dirname( this.dstPath ), nextSeries );
	}, function( nextSeries ) {
		this.stream.pipe( fs.createWriteStream( this.dstPath ) );

		nextSeries();
	} ], callback );
};

Asset.prototype._applyTransforms = function( transforms ) {
	var _this = this;

	if( transforms.length === 0 ) return;

	_this.stream = _this.stream.pipe( combine.apply( null, transforms.map( function( thisTransform ) {
		return thisTransform( _this.srcPath );
	} ) ) );
};