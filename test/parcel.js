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
    var file = __dirname + '/views/page1';
    mkdirp.sync(dst);
    var p = processor(browserify(file), { keys: [ 'style' ], dst: dst });
    p.on('done', function () {
        t.deepEqual(
            fs.readdirSync(dst).sort(),
            [ '7442ea5e6dcd093d10c0fd9f12a05270f61ab310' ]
        );
        var dir = path.join(dst, '7442ea5e6dcd093d10c0fd9f12a05270f61ab310');
        t.deepEqual(fs.readdirSync(dir).sort(), [
            'bundle_0410bd9e41e2f1c21f670d3492f250c8f070eb3f.css',
            'bundle_bd37f2061a35a1fed52946ae31e4227d61c9eb4d.js',
            'view.html',
            'x.css'  
        ]);
    });
});

test('page2', function (t) {
    t.plan(2);
    
    var dst = path.resolve(tmpdir, 'parcel-processor-test-' + Math.random());
    var file = __dirname + '/views/page2';
    mkdirp.sync(dst);
    var p = processor(browserify(file), { keys: [ 'style' ], dst: dst });
    p.on('done', function () {
        t.deepEqual(
            fs.readdirSync(dst).sort(),
            [ 'bc9bc70a0d79d0822fa31e1be58fff93571931f8' ]
        );
        var dir = path.join(dst, 'bc9bc70a0d79d0822fa31e1be58fff93571931f8');
        t.deepEqual(fs.readdirSync(dir).sort(), [
            'bundle_a6b58d4fadf4e84564f330dcb35494db7098f0b7.js',
            'bundle_da39a3ee5e6b4b0d3255bfef95601890afd80709.css',
            'render.jade'
        ]);
    });
});
