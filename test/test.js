var test = require('tape');
var parcelify = require('../');
var os = require('os');
var path = require('path');
var fs = require('fs');
var mkdirp = require('mkdirp');
var tmpdir = (os.tmpdir || os.tmpDir)();

test( 'page1', function( t ) {
	t.plan( 2 );
	
	var mainPath = __dirname + '/page1/main.js';
	
	var dstDir = path.resolve( tmpdir, 'parcelify-test-' + Math.random() );

	var options = {
		bundles : {
			script : path.join( dstDir, 'bundle.js' ),
			style : path.join( dstDir, 'bundle.css' ),
		}
	};

	mkdirp.sync( dstDir );

	p = parcelify( mainPath, options );
	p.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( dstDir ).sort(),
			[ 'bundle.css', 'bundle.js' ]
		);

		t.deepEqual( fs.readFileSync( options.bundles.style, 'utf8' ), 'h1 {\n\tfont-size: 18px;\n}body {\n	color: red;\n}\n' );
	} );

} );

test( 'page2', function( t ) {
	t.plan( 2 );
	
	var mainPath = __dirname + '/page2/index.js';
	
	var dstDir = path.resolve( tmpdir, 'parcelify-test-' + Math.random() );
	var options = {
		bundles : {
			script : path.join( dstDir, 'bundle.js' ),
			style : path.join( dstDir, 'bundle.css' )
		}
	};

	mkdirp.sync( dstDir );

	p = parcelify( mainPath, options );
	p.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( dstDir ).sort(),
			[ 'bundle.css', 'bundle.js' ]
		);

		t.deepEqual( fs.readFileSync( options.bundles.style, 'utf8' ), 'h1 {\n\tfont-size: 18px;\n}h2 {\n\tfont-weight: bold;\n}' );
	} );
} );

test( 'page3', function( t ) {
	t.plan( 2 );
	
	var mainPath = __dirname + '/page3/index.js';
	
	var dstDir = path.resolve( tmpdir, 'parcelify-test-' + Math.random() );
	var options = {
		bundles : {
			script : path.join( dstDir, 'bundle.js' ),
			style : path.join( dstDir, 'bundle.css' )
		}
	};

	mkdirp.sync( dstDir );

	p = parcelify( mainPath, options );
	p.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( dstDir ).sort(),
			[ 'bundle.css', 'bundle.js' ]
		);

		// makes sure when multiple files are listed in a package.json style property, they are concatenated in the right order
		// (in this case in my-other-module, style is [ "myOtherModuleRed.css", "myOtherModuleBlue.css" ] )
		t.deepEqual( fs.readFileSync( options.bundles.style, 'utf8' ), 'h3 {\n\tcolor: red;\n}h2 {\n\tcolor: blue;\n}' );
	} );
} );

test( 'page4', function( t ) {
	t.plan( 3 );
	
	var mainPath = __dirname + '/page4/main.js';
	
	var dstDir = path.resolve( tmpdir, 'parcelify-test-' + Math.random() );
	var options = {
		bundles : {
			script : path.join( dstDir, 'bundle.js' ),
			style : path.join( dstDir, 'bundle.css' ),
			template : path.join( dstDir, 'bundle.tmpl' )
		}
	};

	mkdirp.sync( dstDir );

	p = parcelify( mainPath, options );
	p.on( 'done', function() {
		t.deepEqual(
			fs.readdirSync( dstDir ).sort(),
			[ 'bundle.css', 'bundle.js', 'bundle.tmpl' ]
		);

		t.deepEqual( fs.readFileSync( options.bundles.style, 'utf8' ), 'h1 {\n\tfont-size: 18px;\n}body h3 {\n  color: red; }\n' );
		t.deepEqual( fs.readFileSync( options.bundles.template, 'utf8' ), '<script type="template" id="my-module">\n<p>I am a template in myModule.</p>\n</script>\n<script type="template" id="my-template">\n<p>Hello There! I am a template.</p>\n</script>\n' );
	} );
} );
