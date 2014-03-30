# Parcelify

Output css or other bundles based on the [browserify](http://browserify.org/) dependency graph.

* Use npm packages for interface components with styles and templates.
* Efficiently transform scss / less to css, coffee to JavaScript, etc. using streams.
* Rebuild bundles automatically with watch mode.

Many thanks to [James Halliday](https://twitter.com/substack) for his help and guidance in bringing this project into reality.

[![build status](https://secure.travis-ci.org/rotundasoftware/parcelify.png)](http://travis-ci.org/rotundasoftware/parcelify)

## How dat work?

```
├── node_modules
│   └── my-module
│       ├── index.js
│       ├── myModule.css
│       └── package.json
└── main.js
```

In my-module's `package.json`, the module's style assets just need to be enumerated (glob notation):

```
{
  "name" : "my-module",
  "version": "1.5.0",
  "style" : "*.css"
}
```

In `main.js`, everything looks the same:

```javascript
myModule = require( 'my-module' );

console.log( 'hello world' );
```

After parcelify is run from the command line,

```
$ parcelify main.js -c bundle.css
```

Now `bundle.css` has all the css in the modules on which `main.js` depends (in this case `myModule.css`).

## Installation

```
$ npm install -g parcelify
```

## Command line options

```
--cssBundle, -c   Path of a destination css bundle.

--watch, -w       Watch mode - automatically rebuild bundles as appropriate for changes.

--jsBundle, -j    Path of the JavaScript bundle (i.e. browserify's output).

--debug, -d       Enable source maps that allow you to debug your js files separately. (Pass-thru to browserify.)

--transform, -t   Name or path of a default transform. (See discussion of `defaultTransforms` option.)

--help, -h        Show this message
```

## Tranforms

### Package specific (local) transforms

The safest and most portable way to apply transforms like sass -> css or coffee -> js is using the `transforms` key in a package's package.json. The key should be an array of names or file paths of [transform modules](https://github.com/substack/module-deps#transforms). For example,

```
{
  "name": "my-module",
  "description": "Example module.",
  "version": "1.5.0",
  "style" : "*.scss",
  "transforms" : [ "sass-css-stream" ],
  "dependencies" : {
    "sass-css-stream": "0.0.1"
  }
}
```

All transform modules are called on all assets plus JavaScript files. It is up to the transform module to determine whether or not it should apply itself to a file (usually based on the file extension).

### Application level (global) transforms

You can apply quasi-global, application level transforms using the `defaultTransforms` option, which is an array that contains either transform module names / paths (just like the `transforms` key) or transform functions. Because globally applied transforms can easily conflict with local transforms, default transforms are only applied to packages that to not specify their own local transforms.


```javascript
c = parcelify( mainPath, {
    defaultTransforms : [ 'sass-css-stream' ]
} );
```

If you need more control over which transforms are applied to what packages, you can use the `packageTransform` option to insert transforms into the package.json of specific packages.

```javascript
c = parcelify( mainPath, {
    packageTransform : function( pkg ) {
        if( ! shouldApplyGlobalTransforms( pkg ) ) return pkg;

        pkg.transforms = ( pkg.transforms || [] )
            .concat( [ 'sass-scc-stream' ] );
    }
} );
```

## API

#### p = parcelify( mainPath, [options] )

`mainPath` is the path of the JavaScript entry point file. Options may contain:

* `bundles` - A hash that maps asset types to bundle paths. You will generally just want an entry for a `script` bundle (which is special cased for the browserify bundle) and a `style` bundle, but arbitrary asset types are supported. Default:

```javascript
bundles : {
  script : 'bundle.js',  // send browserify output here (special cased)
  style : 'bundle.css'   // bundle `style` assets and output here
}
```
* `defaultTransforms` (default: undefined) - An array of [transform modules](https://github.com/substack/module-deps#transforms) names / paths or functions to be applied to packages in which no local transforms are specified. Can be used for quasi-global transforms (without the risk of conflicting with packages that use their own transforms).
* `browserifyInstance` (default: undefined) - Use your own instance of browserify / watchify.
* `browserifyBundleOptions` (default: {}) - Passed through directly to browserify.bundle().
* `watch` : Watch mode - automatically rebuild bundles as appropriate for changes.

A parcelify object is returned, which is an event emitter.

### p.on( 'done', function(){} );
Called when all bundles have been output.

### p.on( 'error', function( err ){} );
Called when an error occurs.

### p.on( 'packageCreated', function( package, isMain ){} );
Called when a new package is created. `package` is a package object as defined in `lib/package.js`. `isMain` is true iff the package corresponds to the entry point `mainPath`.

### p.on( 'assetUpdated', function( eventType, asset ){} );
Called when a style asset is updated in watch mode. `eventType` is `'added'`, `'changed'`, or `'deleted'`, and `asset` is an asset object as defined in `lib/asset.js`.

## Client side templates and other assets

Parcelify actually supports concatenation / enumeration of arbitrary asset types. Just add a bundle for an asset type in the `bundles` option and use the same key to enumerate assets of that type in package.json.

A tempting use case for this feature is client side templates - just include a `template` key in package.json and a corresponding entry in the `bundles` option, and you have a bundle of client side templates. However, if you plan to share your packages we recommend against this practice as it makes your packages difficult to consume. Instead we recommend using a browserify transform like [node-hbsfy](https://github.com/epeli/node-hbsfy) or [nunjucksify](https://github.com/rotundasoftware/nunjucksify) to precompile templates and `require` them explicitly from your JavaScript files.

For the case of assets like images, that do not need to be concatenated, you can specify a `null` path for the bundle. Parcelify will collect all assets of that type but not concatenate them. You can then process the individual assets further using the event callbacks.

## Contributors

* [James Halliday](https://twitter.com/substack) (Initial design, sage advice, many supporting modules)
* [David Beck](https://twitter.com/davegbeck)
* [Oleg Seletsky](https://github.com/go-oleg)

## License

MIT
