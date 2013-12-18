# manger - cache feeds 

The manger [Node.js](http://nodejs.org/) module caches RSS and Atom formatted XML feeds using [LevelDB](https://github.com/rvagg/node-levelup).

[![Build Status](https://secure.travis-ci.org/michaelnisi/manger.png)](http://travis-ci.org/michaelnisi/manger) [![David DM](https://david-dm.org/michaelnisi/manger.png)](http://david-dm.org/michaelnisi/manger)

## Usage

### Stream [entries](https://github.com/michaelnisi/pickup#evententry):
```js
var entries = require('manger').entries
  , levelup = require('levelup')

json()
  .pipe(entries(opts()))
  .pipe(process.stdout)

function json () {
  // Readable stream of JSON in the format:
  // '[{ "url":"http://5by5.tv/rss", "since":1388530800000 }]'
}

function opts () {
  return { db:db() }
}

function db () {
  return levelup('./mydb')
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

### opts()
- `db`
- `mode` 1 | 2

## Installation

[![NPM](https://nodei.co/npm/manger.png)](https://npmjs.org/package/manger)

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)

