# manger - cache feeds 

The manger [Node.js](http://nodejs.org/) module caches RSS and Atom formatted XML feeds using [LevelDB](https://github.com/rvagg/node-levelup).

[![Build Status](https://secure.travis-ci.org/michaelnisi/manger.png)](http://travis-ci.org/michaelnisi/manger) [![David DM](https://david-dm.org/michaelnisi/manger.png)](http://david-dm.org/michaelnisi/manger)

## Usage

### Stream [entries](https://github.com/michaelnisi/pickup#evententry) as JSON string (as an array)

```js
var entries = require('manger').entries
  , queries = require('manger').queries
  , levelup = require('levelup')
  , assert = require('assert')
  , stread = require('stread')

start(function (er, db) {
  assert(!er && db)
  stread(json())
    .pipe(queries())
    .pipe(entries({ db:db }))
    .pipe(process.stdout)
})

function start (cb) {
  levelup(loc(), null, function (er, db) {
    cb(er, db)
  })
}

function terms () {
  return [
    { url:"feeds.muleradio.net/thetalkshow", since:Date.UTC(2013, 11)}
  , { url:"5by5.tv/rss", since:Date.UTC(2013, 11) }
  ]
}

function json () {
  return JSON.stringify(terms())
}

function loc () {
  return '/tmp/mangerdb'
}
```

To try this from the command-line:
```
node example/entries.js | json
```

## API

### entries(opts())

### feeds(opts())

### update(db)

- `db` A levelup database instance

### queries()

### opts()

- `db` A levelup database instance
- `mode` Possible modes are 1, 2, and 3 (default)

## Installation

[![NPM](https://nodei.co/npm/manger.png)](https://npmjs.org/package/manger)

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)

