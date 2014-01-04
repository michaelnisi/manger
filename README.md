# manger - cache feeds 

The manger [Node.js](http://nodejs.org/) module caches RSS and Atom formatted XML feeds using [LevelDB](https://github.com/rvagg/node-levelup). But not only does it cache, it supports aggregated requests with individual time intervals (from now). I wrote it for a mobile client which needs to get all updated entries of multiple feeds and time spans with a single request.

[![Build Status](https://secure.travis-ci.org/michaelnisi/manger.png)](http://travis-ci.org/michaelnisi/manger) [![David DM](https://david-dm.org/michaelnisi/manger.png)](http://david-dm.org/michaelnisi/manger)

## Usage

```js
var manger = require('manger')
  , levelup = require('levelup')
  , assert = require('assert')

start(function (er, db) {
  assert(!er && db)
  process.stdin
    .pipe(manger.queries())
    .pipe(manger.entries({ db:db }))
    .pipe(process.stdout)
})

function start (cb) {
  levelup('/tmp/mangerdb', null, function (er, db) {
    cb(er, db)
  })
}
```

To try this example on the command-line, you might want to pipe it to [json](https://github.com/trentm/json) like so:
```
cat example/5by5.json | node example/stdin.js | json
```

Running this again, you should see cached data.

## Installation

[![NPM](https://nodei.co/npm/manger.png)](https://npmjs.org/package/manger)

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)

