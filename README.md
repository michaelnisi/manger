# manger - cache feeds (WIP) 

The manger [Node.js](http://nodejs.org/) module caches RSS and Atom formatted XML feeds using [LevelDB](https://github.com/rvagg/node-levelup).

[![Build Status](https://secure.travis-ci.org/michaelnisi/manger.png)](http://travis-ci.org/michaelnisi/manger) [![David DM](https://david-dm.org/michaelnisi/manger.png)](http://david-dm.org/michaelnisi/manger)

## Usage

Stream [feeds](https://github.com/michaelnisi/pickup#eventfeed):
```js
var resumer = require('resumer')
  , feeds = require('manger').feeds

resumer().queue(json())
  .pipe(feeds(db()))
  .pipe(process.stdout)
```

Stream [entries](https://github.com/michaelnisi/pickup#evententry):
```js
var resumer = require('resumer')
  , entries = require('manger').entries

resumer().queue(json())
  .pipe(entries(db()))
  .pipe(process.stdout)
```

json()
```js
JSON.stringify(queries())
```
queries()
```js
[
  { url:'http://5by5.tv/rss', time:new Date(2013, 12, 11).getTime() }
]
```
db()
```js
levelup('./mydb')
```

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)

