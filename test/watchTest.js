var parcelify = require('../');
var path = require('path');
var fs = require('fs');
var mkdirp = require('mkdirp');

var mainPath = __dirname + '/page1/main.js';
	
var dstDir = 'watch-test-output';

var options = {
	bundles : {
		script : path.join( dstDir, 'bundle.js' ),
		style : path.join( dstDir, 'bundle.css' ),
	},

	watch : true
};

mkdirp.sync( dstDir );

parcelify( mainPath, options, function( err, parcel ) {
	if( err ) throw err;

	parcel.on( 'done', function() {
		console.log( 'test-done' );
	} );
} );