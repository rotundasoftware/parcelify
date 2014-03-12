var fs = require( 'fs' );
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
}

Asset.prototype.createReadStream = function() {
	var stream = fs.createReadStream( this.srcPath );
	return this._applyTransforms( stream, this.transforms );
};

Asset.prototype.writeToDisk = function( dstPath, makeDir, callback ) {
	this.dstPath = dstPath;

	async.series( [ function( nextSeries ) {
		if( ! makeDir ) return nextSeries();

		mkdirp( path.dirname( this.dstPath ), nextSeries );
	}, function( nextSeries ) {
		this.createReadStream().pipe( fs.createWriteStream( this.dstPath ) );

		nextSeries();
	} ], callback );
};

Asset.prototype._applyTransforms = function( stream, transforms ) {
	var _this = this;

	if( transforms.length === 0 ) return stream;

	return stream.pipe( combine.apply( null, transforms.map( function( thisTransform ) {
		return thisTransform( _this.srcPath );
	} ) ) );
};
