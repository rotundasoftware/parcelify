
# Parcelify

Don't you wish you could include css and other assets in npm modules? Parcelify is a wrapper around James Halliday's browserify that allows you to easily bundle css and templates using yoru normal commonjs requires.

## How dat work?

```
├── node_modules
│   └── my-module
│       ├── index.js
│       ├── myModule.css
│       └── package.json
└── main.js
```

In package.json,

```
{
	"style" : "myModule.css"
}
```

Meanwhile, in `main.js`,

```javascript
myModule = require( 'my-module' );

console.log( 'hello world' );
```

Now

```
$ npm install parcelify
$ parcelify index.js -j bundle.js -c bundle.css
```

Now bundle.css contains all the styles that correspond to the index.js entry point.

## Usage

```
parcelify mainFile.js [options]
```

Standard Options:

    --jsBundle, -j  Path of the javascript bundle, which is the exact same bundle as produced by browserify.
                    If unspecified, no javscript bundle is created.

    --cssBundle, -c  Path of the style bundle. If unspecified, no css bundle is created.

    --tmplBundle, -t  Path of the template bundle. Templates may be specified in the exact same way as styles, just using a `template` key in `package.json` instead of a `style` key.
   
       --watch, -w  Watch mode. When watch mode is on, bundles are automatically rebuild as appropriate for changes.
    
       --debug -d  Enable source maps that allow you to debug your js files
                   separately. (Passed through to browserify.)

       --help, -h  Show this message

## License

MIT