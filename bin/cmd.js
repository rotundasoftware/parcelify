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
			transform : "t",
			watch : "w",
			maps : "m",
			help : "h"
		},
		boolean : [ "watch", "help", "maps" ]
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
var defaultTransforms = argv.transform;
var logLevel = argv.loglevel;
var watch = argv.watch;
var maps = argv.maps;

if( ! mainPath ) {
	console.log( "No entry point specified" );
	process.exit( 1 );
}

var p = parcelify( mainPath, {
	bundles : {
		script : jsBundle,
		style : cssBundle,
		template : tmplBundle
	},
	defaultTransforms : defaultTransforms,
	browserifyBundleOptions : {
		debug : maps
	},
	watch : watch,
	logLevel : logLevel
} );

p.on( 'error', function( err ) {
	console.log( err.stack );
	process.exit( 1 );
} );

p.on( "done", function() {
	if( ! watch )
		process.exit( 0 );
} );

function resolvePath( inputPath ) {
	return inputPath ? path.resolve( inputPath ) : inputPath;
}
