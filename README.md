# manger - cache feeds 

The manger [Node.js](http://nodejs.org/) module caches RSS and Atom formatted XML feeds using [LevelDB](https://github.com/rvagg/node-levelup).

[![Build Status](https://secure.travis-ci.org/michaelnisi/manger.png)](http://travis-ci.org/michaelnisi/manger) [![David DM](https://david-dm.org/michaelnisi/manger.png)](http://david-dm.org/michaelnisi/manger)

## Usage

Stream [feeds](https://github.com/michaelnisi/pickup#eventfeed):
```js
var resumer = require('resumer')
  , time = require('manger').time
  , feeds = require('manger').feeds

var queries = [
  { url:'http://5by5.tv/rss', time:time(2013, 11, 11) }
]

var json = JSON.stringify(queries)
  , stdout = process.stdout

resumer().queue(json)
  .pipe(feeds())
  .pipe(stdout)
```

Stream [entries](https://github.com/michaelnisi/pickup#evententry):
```js
var resumer = require('resumer')
  , time = require('manger').time
  , entries = require('entries').entries

var queries = [
  { url:'http://5by5.tv/rss', time:time(2013, 11, 11) }
]

var json = JSON.stringify(queries)
  , stdout = process.stdout

resumer().queue(json)
  .pipe(entries())
  .pipe(stdout)
```
## Installation

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)

