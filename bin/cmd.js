#!/usr/bin/env node

var parcelify = require('../');
var minimist = require( "minimist" );
var path = require( "path" );
var fs = require( "fs" );

var argv = minimist( process.argv.slice(2),
	{
		alias : {
			jsBundle : "j",
			cssBundle : "c",
			tmplBundle : "t",
			watch : "w",
			debug : "d",
			help : "h"
		},
		boolean : [ "watch", "help", "debug" ]
	}
);

if( argv.help ) {
	return fs.createReadStream( __dirname + "/help.txt" ).pipe( process.stdout ).on( "close", function() {
		process.exit( 0 );
	} );
}

// resolve to absolute paths
var jsBundle = resolvePath( argv.jsBundle );
var cssBundle = resolvePath( argv.cssBundle );
var tmplBundle = resolvePath( argv.tmplBundle );
var mainPath = resolvePath( argv._[0] );
var watch = argv.watch;
var debug = argv.debug;

if( ! mainPath ) {
	console.log( "No entry point specified" );
	process.exit( 1 );
}

parcelify( mainPath, {
	bundles : {
		script : jsBundle,
		style : cssBundle,
		template : tmplBundle
	},
	browserifyBundleOptions : {
		debug : debug
	},
	watch : watch
}, function( err, parcel ) {
	if( err ) {
		console.log( err.stack );
		process.exit( 1 );
	}

	parcel.on( "done", function() {
		if( ! watch )
			process.exit( 0 );
	} );
} );

function resolvePath( inputPath ) {
	return inputPath ? path.resolve( inputPath ) : inputPath;
}
