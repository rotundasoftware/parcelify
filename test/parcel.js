var test = require('tape');
var processor = require('../');
var os = require('os');
var path = require('path');
var fs = require('fs');
var mkdirp = require('mkdirp');
var browserify = require('browserify');
var tmpdir = (os.tmpdir || os.tmpDir)();

test('page1', function (t) {
    t.plan(2);
    
    var dst = path.resolve(tmpdir, 'parcel-processor-test-' + Math.random());
    var file = __dirname + '/views/page1/main.js';
    mkdirp.sync(dst);
    console.log( dst );

    processor( file, { keys: [ 'style' ], dst: dst }, function( err, packageRegistry, parcelId ) {
        if( err ) throw err;

        t.deepEqual(
            fs.readdirSync(dst).sort(),
            [ '9080c80726d3c57778c8d6f958b20a68fd87c803' ]
        );

        var dir = path.join(dst, '9080c80726d3c57778c8d6f958b20a68fd87c803');

        t.deepEqual(fs.readdirSync(dir).sort(), [
            'assets.json','page1_bundle_9bc0cf50f56d050e8d9fe361143efe313becccce.css','page1_bundle_bd37f2061a35a1fed52946ae31e4227d61c9eb4d.js'
        ]);
    } );
});

test('page2', function (t) {
    t.plan(2);
    
    var dst = path.resolve(tmpdir, 'parcel-processor-test-' + Math.random());
    var file = __dirname + '/views/page2/index.js';
    mkdirp.sync(dst);
    processor( file, { keys: [ 'style' ], dst: dst }, function( err, packageRegistry, parcelId ) {
        if( err ) throw err;

        t.deepEqual(
            fs.readdirSync(dst).sort(),
            [ 'c030c36ffcadcf41c1025490122ec7f3605092ac' ]
        );

        var dir = path.join(dst, 'c030c36ffcadcf41c1025490122ec7f3605092ac');

        t.deepEqual(fs.readdirSync(dir).sort(), [
            "assets.json","page2_bundle_a6b58d4fadf4e84564f330dcb35494db7098f0b7.js","page2_bundle_da39a3ee5e6b4b0d3255bfef95601890afd80709.css"
        ]);
    } );
});
