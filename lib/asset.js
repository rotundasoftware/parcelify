var fs = require( 'fs' );
var resolve = require( 'resolve' );
var async = require( 'async' );
var mkdirp = require( 'mkdirp' );
var combine = require( "stream-combiner" );
var path = require( "path" );

module.exports = Asset;

function Asset( srcPath, dstPath, transforms ) {
   this.srcPath = srcPath;
   this.dstPath = dstPath;
   this.transforms = transforms;

   this.createStream( transforms );
}

Asset.prototype.createStream = function( transforms ) {
	this.stream = fs.createReadStream( this.srcPath );
	this._applyTransforms( this.transforms );
};

Asset.prototype.writeStreamToDisk = function() {
	mkdirp.sync( path.dirname( this.dstPath ) );
	this.stream.pipe( fs.createWriteStream( this.dstPath ) );
};

Asset.prototype._applyTransforms = function( transforms ) {
	var _this = this;

	if( transforms.length === 0 ) return;

	_this.stream = _this.stream.pipe( combine.apply( null, transforms.map( function( thisTransform ) {
		return thisTransform( _this.srcPath );
	} ) ) );
};