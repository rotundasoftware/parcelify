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

var p = parcelify( mainPath, options );
p.on( 'done', function() {
	console.log( 'test-done' );
} );