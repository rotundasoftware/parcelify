#!/usr/bin/env node

var parcelify = require('../');
var minimist = require( "minimist" );
var path = require( "path" );

var argv = minimist( process.argv.slice(2),
	{
		alias : {
			mainPath : "m",
			jsBundle : "j",
			cssBundle : "c",
			tmplBundle : "t",
			watch : "w",
			debug : "d",
			help : "h"
		},
		boolean : [ "watch" ]
	}
);

// resolve to absolute paths
var jsBundle = resolvePath( argv.jsBundle );
var cssBundle = resolvePath( argv.cssBundle );
var tmplBundle = resolvePath( argv.tmplBundle );
var mainPath = resolvePath( argv.mainPath );

parcelify( mainPath, {
	bundles : {
		script : jsBundle,
		style : cssBundle,
		template : tmplBundle
	}
}, function( err, parcel ) {
	if( err ) {
		console.log( err.stack );
		process.exit( 1 );
	}

	parcel.on( "done", function() {
		process.exit( 0 );
	} );
} );

function resolvePath( inputPath ) {
	return inputPath ? path.resolve( inputPath ) : inputPath;
}
