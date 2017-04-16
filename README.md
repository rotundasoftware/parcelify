# Parcelify

Add css to your npm modules consumed with [browserify](http://browserify.org/).

* Just add a `style` key to your `package.json` to specify the package's css file(s).
* Efficiently transform scss / less to css, etc. using transform streams.
* Rebuild css bundles automatically on changes in watch mode.
* Leverage a robust API to create larger build tools like [cartero](https://github.com/rotundasoftware/cartero).

Many thanks to [James Halliday](https://twitter.com/substack) for his help and guidance in bringing this project into reality.

[![build status](https://secure.travis-ci.org/rotundasoftware/parcelify.png)](https://api.travis-ci.org/rotundasoftware/parcelify.svg?branch=master)

## How dat work?

```
├── node_modules
│   └── my-module
│       ├── index.js
│       ├── myModule.css
│       └── package.json
└── main.js
```

In my-module's `package.json`, the module's style assets just need to be enumerated (in [glob](https://github.com/isaacs/node-glob#glob-primer) notation):

```
{
  "name" : "my-module",
  "version": "1.5.0",
  "style" : "*.css"      // glob notation. can optionally be an array
}
```

In `main.js`, everything looks the same:

```javascript
myModule = require( 'my-module' );

console.log( 'hello world' );
```

Now just run parcelify as a [browserify plugin](https://github.com/substack/node-browserify#plugins) using browserify's `-p` flag:

```
$ browserify main.js -o bundle.js -p [ parcelify -o bundle.css ]
``` 

Parcelify will concatenate all the css files in the modules on which `main.js` depends -- in this case just `myModule.css` -- in the order of the js dependency graph, and write the output to `bundle.css`.

Use the `-w` flag to keep the bundle up to date when changes are made in dev mode:

```
$ watchify main.js -o bundle.js -p [ parcelify -wo bundle.css ]
```

## Installation

In your project directory,

```
$ npm install parcelify
```

## Plugin options

```
--cssBundle, -o     Path of the destination css bundle.

--watch, -w         Watch mode - automatically rebuild css bundle as appropriate for changes.

--transform, -t     Name or path of an application transform. (See discussion of application transforms.)

--transformDir, -d  Path of an application transform directory. (See discussion of application transforms.)

--loglevel -l       Set the verbosity of npmlog, eg. "silent", "error", "warn", "info", "verbose"
```

## Transforms

### Local (package specific) transforms

The safest and most portable way to apply transforms like sass -> css is using the `transforms` key in a package's package.json. The key should be an array of names or file paths of [transform modules](https://github.com/substack/module-deps#transforms). For example,

```
{
  "name": "my-module",
  "description": "Example module.",
  "version": "1.5.0",
  "style" : "*.scss",
  "transforms" : [ "sass-css-stream" ],
  "dependencies" : {
    "sass-css-stream": "^0.0.1"
  }
}
```

All transform modules are called on all assets. It is up to the transform module to determine whether or not it should apply itself to a file (usually based on the file extension).

### Application level transforms

You can apply transforms to all packages within an entire branch of the directory tree using the `appTransforms` and `appTransformDirs` options or their corresponding command line arguments. (Packages inside a `node_modules` folder located inside one of the supplied directories are not effected.) For example, to transform all sass files inside the current working directory to css,

```
$ browserify main.js -o bundle.js -p [ parcelify -o bundle.css -t sass-css-stream -d . ]
```

### Catalog of transforms

The following transforms can be used with parcelify. Please let us know if you develop a transform and we'll include it in this list.

* [sass-css-stream](https://github.com/rotundasoftware/sass-css-stream) - convert sass to css.
* [less-css-stream](https://github.com/jsdf/less-css-stream) - convert less to css.
* [sass-bourbon-transform](https://github.com/rotundasoftware/sass-bourbon-transform) - convert sass to css with [bourbon](http://bourbon.io/).
* [css-img-datauri-stream](https://github.com/jbkirby/css-img-datauri-stream) - inline images in your css with data urls.
* [parcelify-import-resolver](https://github.com/johanneslumpe/parcelify-import-resolver) - resolve paths using the node resolve algorithm.

## API

#### p = parcelify( b, [options] )

`b` is a browserify instance. You must call `b.bundle()` before parcelify will do its thing. Options are:

* `bundles` - A hash that maps asset types to bundle paths. You will generally just want an entry for a `style` bundle, but arbitrary asset types are supported. Default:

```javascript
bundles : {
  style : 'bundle.css'   // bundle `style` assets and output here
}
```
* `bundlesByEntryPoint` (default: undefined) - If multiple entry points have been supplied to the browserify instance, this option is used to determine the output bundles for each entry point, instead of `bundles`. For example:
```
{
  '/Users/me/myWebApp/views/page1/page1.js' : { style : 'static/page1.css' },
  '/Users/me/myWebApp/views/page2/page2.js' : { style : 'static/page2.css' }
}
```
* `appTransforms` (default: undefined) - An array of [transform modules](https://github.com/substack/module-deps#transforms) names / paths or functions to be applied to all packages in directories in the `appTransformDirs` array.
* `appTransformDirs` (default: undefined) - `appTransforms` are applied to any packages that are within one of the directories in this array. (The recursive search is stopped on `node_module` directories.)
* `logLevel` - set the [npmlog](https://www.npmjs.org/package/npmlog) logging level.
* `watch` (default: false) - automatically rebuild bundles as appropriate for changes.

A parcelify object is returned, which is an event emitter.

### p.on( 'done', function(){} );
Called when all bundles have been output.

### p.on( 'error', function( err ){} );
Called when an error occurs.

### p.on( 'packageCreated', function( package ){} );
Called when a new package is created. `package` is a package object as defined in `lib/package.js`.

### p.on( 'assetUpdated', function( eventType, asset ){} );
Called when a style asset is updated in watch mode. `eventType` is `'added'`, `'changed'`, or `'deleted'`, and `asset` is an asset object as defined in `lib/asset.js`.

## Client side templates and other assets

Parcelify actually supports concatenation / enumeration of arbitrary asset types. Just add a bundle for an asset type in the `bundles` option and use the same key to enumerate assets of that type in package.json.

A tempting use case for this feature is client side templates - just include a `template` key in package.json and a corresponding entry in the `bundles` option, and you have a bundle of client side templates. However, if you plan to share your packages we recommend against this practice as it makes your packages difficult to consume. Instead we recommend using a browserify transform like [nunjucksify](https://github.com/rotundasoftware/nunjucksify) or [node-hbsfy](https://github.com/epeli/node-hbsfy) to precompile templates and `require` them explicitly from your JavaScript files.

For the case of assets like images, that do not need to be concatenated, you can specify a `null` path for the bundle. Parcelify will collect all assets of that type but not concatenate them. You can then process the individual assets further using the event callbacks. See [cartero](https://github.com/rotundasoftware/cartero) for an example of this more advanced use case.

### Command line usage (depreciated)

You can also run parcelify directly from the command line, although this functionality is depreciated. Note browserify needs to be installed (or watchify, in the case that the -w flag is used).

```
$ parcelify main.js -o bundle.css
```

In addition to the options available when running parcelify as a browserify plugin, the follow options are also supported from the command line.

```
--jsBundle, -j    Path to save the JavaScript bundle (i.e. browserify's output).

--maps, -m        Enable JavaScript source maps in js bundles (for dev mode).

--help, -h        Show this message
```

## Contributors

* [James Halliday](https://twitter.com/substack) (Initial design, sage advice, supporting modules)
* [David Beck](https://twitter.com/davegbeck)
* [Oleg Seletsky](https://github.com/go-oleg)

## License

MIT

