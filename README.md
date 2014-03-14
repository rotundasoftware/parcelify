# Parcelify

Create css bundles from npm packages using the [browserify](http://browserify.org/) dependency graph.

* Use npm packages for reusable interface components that have their own styles.
* Easily include transforms for scss, less, etc. on a per-package basis.
* Rebuild css bundle automatically with watch mode.

Many thanks to [James Halliday](https://twitter.com/substack) for his help and guidance in bringing this module into reality.

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
  "style" : [ "*.css" ]
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
--cssBundle, -c   Path of the css bundle. If unspecified, no css bundle is output.

--watch, -w       Watch mode - automatically rebuild bundles as appropriate for changes.

--jsBundle, -j    Path of the optional JavaScript bundle (i.e. browserify's output).

--debug, -d       Enable source maps that allow you to debug your js files separately.
                  (Passed through to browserify.)

--help, -h        Show this message
```

## package.json

Several keys are special cased in package.json files.

* The `style` key is a glob or array of globs that enumerates the style assets of the module.
* The `tranforms` key is an array of names or file paths of [transform modules](https://github.com/substack/module-deps#transforms) to be applied to assets.

```
{
  "name": "my-module",
  "description": "Example package.json for hypothetical myModule.",
  "version": "1.5.0",
  "style" : "*.scss",
  "transforms" : [ "sass-css-stream" ],
  "devDependencies" : {
    "sass-css-stream": "0.0.1"
  }
}
```

## API

#### p = parcelify( mainPath, [options] )

mainPath is the path of the JavaScript entry point file. options are as follows:

```javascript
{
    bundles : {
      style : 'bundle.css',      // path of css bundle
      script : 'bundle.js',      // path of javascript bundle (not output if omitted)
    },
    
    browserifyInstance : undefined  // use your own instance of browserify / watchify
    browserifyBundleOptions : {}    // passed through to browserify.bundle()

    watch : false,
}
```

A parcelify object is returned, which is an event emitter.

### p.on( 'done', function(){} );
Called when the css bundle has been output.

### p.on( 'error', function( err ){} );
Called when a error occurs.

### p.on( 'packageCreated', function( package, isMain ){} );
Called when a new package is created. `package` is a package object as defined in lib/package.js. `isMain` is true iff the package corresponds to the entry point at mainPath.

### p.on( 'assetUpdated', function( eventType, asset ){} );
Called when a style asset is updated in watch mode. `eventType` is `'added'`, `'changed'`, or `'deleted'`, and `asset` is an asset object as defined in lib/asset.js.

## What about client side templates?

We recommend using a browserify transform to precompile and export templates when they are `require`d from JavaScript code.

## Contributors

* [James Halliday](https://twitter.com/substack) (Initial design, sage advice, many supporting modules)
* [David Beck](https://twitter.com/davegbeck)
* [Oleg Seletsky](https://github.com/go-oleg)

## License

MIT
