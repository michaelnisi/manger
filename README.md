# manger - cache feeds (WIP) 

The manger [Node.js](http://nodejs.org/) module caches RSS and Atom formatted XML feeds using [LevelDB](https://github.com/rvagg/node-levelup).

[![Build Status](https://secure.travis-ci.org/michaelnisi/manger.png)](http://travis-ci.org/michaelnisi/manger) [![David DM](https://david-dm.org/michaelnisi/manger.png)](http://david-dm.org/michaelnisi/manger)

## Usage

### Stream [entries](https://github.com/michaelnisi/pickup#evententry):
```js
var entries = require('manger').entries

json()
  .pipe(entries(db()))
  .pipe(process.stdout)
```

### `json()`
```js
'[{ "url":"http://5by5.tv/rss", "since":1388530800000 }]'
```

### `db()`
```js
levelup('./mydb')
```

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)

