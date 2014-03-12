
# Parcelify

Parcelify is a [browserify](http://browserify.org/) wrapper that creates css and / or template bundles from assets in npm modules.

Many thanks to [James Halliday](https://twitter.com/substack) for his pivotal role in bringing this module into reality.

## How dat work?

```
├── node_modules
│   └── my-module
│       ├── index.js
│       ├── myModule.css
│       ├── myModule.scss
│       └── package.json
└── main.js
```

In my-module's package.json, the module's style assets are enumerated (glob notation):

```
{
  "name" : "my-module",
  "version": "1.5.0",
	"style" : [ "*.css" ]
}
```

Meanwhile, in `main.js`,

```javascript
myModule = require( 'my-module' );

console.log( 'hello world' );
```

To run parcelify from the command line,

```
$ parcelify main.js -j bundle.js -c bundle.css
```

Now `bundle.css` contains all the styles that correspond to the `main.js` entry point, and `bundle.js` is browserify's output.

## Installation

```
npm install -g parcelify
```

## Command line options

```
--jsBundle, -j    Path of the JavaScript bundle. If unspecified, no javscript bundle is output.
                
--cssBundle, -c   Path of the style bundle. If unspecified, no css bundle is output.

--tmplBundle, -t  Path of the template bundle. If unspecified.. you get it. Template assets
                  are enumerated in the exact same way as style assets, just using a 
                  template key in package.json instead of a `style` key.

--watch, -w       Watch mode - automatically rebuild bundles as appropriate for changes.

--debug, -d       Enable source maps that allow you to debug your js files separately.
                  (Passed through directly to browserify.)

--help, -h        Show this message
```

## package.json

Several keys are special cased in package.json files.

* The `style` key is a glob or array of globs that describe the style assets of the module.
* The `template` key is the same as the `style` key, just for templates instead of styles.
* The `tranforms` key is an array of names or file paths of [transform modules](https://github.com/substack/module-deps#transforms) to be applied to assets.

```
{
  "name": "my-module",
  "description": "Example package.json for hypothetical myModule.",
  "version": "1.5.0",
  "style" : "*.scss",
  "template" : [ "templates/part_1.tmpl", "templates/part_2.tmpl" ],
  "transforms" : [ "sass-css-stream" ],
  "devDependencies" : {
    "sass-css-stream": "0.0.1"
  }
}
```

## API

#### parcelify( mainPath, [options,] callback )

mainPath is the path of the JavaScript entry point file. options are as follows:

```javascript
{
    bundles : {
      script : 'bundle.js',      // path of javascript bundle (not output if omitted)
      style : 'bundle.css',      // path of css bundle (not output if omitted)
      template : 'bundle.tmpl'   // path of tempate bundle (not output if omitted)
    },
    watch : false, 
    packageTransform : undefined,   // a function that transforms parsed package.json
                                    // contents before the values are used. Can be used
                                    // to transform the package.json of modules in which
                                    // the package.json is incomplete or incorrect. Should
                                    // return the transformed parsed package.json contents.

    browserifyInstance : undefined  // use your own instance of browserify which needs to
                                    // have been initialized with mainPath.
}
```

The callback has the signature `callback( err, parcel )`. `parcel` is an event emitter.

### parcel.on( 'done', function(){} );
Called when all bundles have been output.

### parcel.on( 'package', function( package ){} );
Called when a new package is created. `package` is a package object as defined in lib/package.js.

### parcel.on( 'assetUpdated', function( eventType, asset ){} );
Called when a style or template asset is updated in watch mode. `eventType` is `'added'`, `'changed'`, or `'deleted'`, and `asset` is an asset object as defined in lib/asset.js.

## Contributors

* [James Halliday](https://twitter.com/substack)
* [David Beck](https://twitter.com/davegbeck)
* [Oleg Seletsky](https://github.com/go-oleg)

## License

MIT