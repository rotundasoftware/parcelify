# parcel-processor

write asset files to a package directory given an entry point

# example

Given an entry point on `process.argv[2]`, create a browserify bundle and write
the inline assets to `opts.dst`:

``` js
var copier = require('parcel-processor');
var browserify = require('browserify');
var path = require('path');
var file = path.resolve(process.argv[2]);

var opts = {
    keys: [ 'style' ],
    dst: __dirname + '/dst'
};
copier(browserify(file), opts);
```

# methods

``` js
var copier = require('parcel-processor')
```

## var cp = copier(b, opts)

Given a [browserify](https://npmjs.org/package/browserify) instance `b` and some
options `opts`, copy asset files from the
[parcel-map](https://npmjs.org/package/parcel-map) output to the destination
`opts.dst`.

The options are:

* `opts.dst` - the destination root to start writing package files at
* `opts.keys` - array of keys for
[parcel-map](https://npmjs.org/package/parcel-map) to read from the package.json
* `opts.defaults` - object of default values passed directly through to 
[parcel-map](https://npmjs.org/package/parcel-map)

The return value is an event emitter `cp` with some events documented below.

# events

## cp.on('bundle.css', function (file) {})

When the concatenated css bundle has been written, this event fires with the
file path.

## cp.on('bundle.js', function (file) {})

When the concatenated js bundle has been written, this event fires with the file
path.

## cp.on('package', function (pkg) {})

This event fires when a package is being written.

`pkg` has these properties:

* `pkg.package` - the package.json contents
* `pkg.assets` - an array of assets paths declared in `pkg`
* `pkg.id` - the package.json identifier from
[parcel-map](https://npmjs.org/package/parcel-map)
* `pkg.files` - an object mapping the `opts.keys` types to arrays of matching
file paths for each type
* `pkg.path` - the path to the package root containing a package.json
* `pkg.dependencies` - an array of dependency ids that `pkg` depends on
* `pkg.hash` - the hash name used for the asset directory

Example `pkg` output:

```
{ package: 
   { view: 'view.html',
     main: 'main.js',
     style: '*.css',
     __dirname: '/home/substack/projects/parcel-processor/example/views/page1' },
  assets: [ '/home/substack/projects/parcel-processor/example/views/page1/x.css' ],
  id: '2814e2ae0d4b530be5c8adee15a7d5ce16246f96',
  files: { style: [ '/home/substack/projects/parcel-processor/example/views/page1/x.css' ] },
  path: '/home/substack/projects/parcel-processor/example/views/page1',
  dependencies: [],
  hash: '5c1f45e9747e602cfcda7c2b390b6779d11acb80' }
```

## cp.on('map', function (map) {})

This event fires when the asset map from
[parcel-map](https://npmjs.org/package/parcel-map) is available.

# install

With [npm](https://npmjs.org) do:

```
npm install parcel-processor
```

# license

MIT
