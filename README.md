# manger - cache feeds 

The manger [Node.js](http://nodejs.org/) module caches RSS and Atom formatted XML feeds.

[![Build Status](https://secure.travis-ci.org/michaelnisi/manger.png)](http://travis-ci.org/michaelnisi/manger) [![David DM](https://david-dm.org/michaelnisi/manger.png)](http://david-dm.org/michaelnisi/manger)

## Usage

A stream of feed objects:
```js
var FeedStream = require('manger').FeedStream
  , Request = require('manger').Request
  , time = require('manger').time

var reqs = [
  new Request('http://5by5.tv/rss', time(2013,11,11)
]

var feeds = new FeedStream()

```

## Installation

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)

