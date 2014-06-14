
# manger - cache feeds 

The manger [Node](http://nodejs.org/) module caches RSS and Atom formatted XML feeds using [LevelUP](https://github.com/rvagg/node-levelup). It supports aggregated requests with individual time intervals (from now). I use it in a mobile service which needs to get all updated entries of multiple feeds and time spans with a single request.

[![Build Status](https://secure.travis-ci.org/michaelnisi/manger.svg)](http://travis-ci.org/michaelnisi/manger) [![David DM](https://david-dm.org/michaelnisi/manger.svg)](http://david-dm.org/michaelnisi/manger)

## Usage

### Pipe stdin

```js
var manger = require('../')
  , levelup = require('levelup')
  ;
levelup('/tmp/mangerdb', null, function (er, db) {
  process.stdin
    .pipe(manger(db))
    .pipe(process.stdout)
})
```

You might try this by piping the example with some input to [json](https://github.com/trentm/json) on the command-line:

```
echo '[{ "url":"http://5by5.tv/rss" }]' | node example/stdin.js | json -a title
```

Limit the range by supplying a date:

```
echo '[{ "url":"http://5by5.tv/rss", "since":"2014-06-07" }]' | node example/stdin.js | json -a title
```

## Description

The manger module leverages the lexicographical key sort order of LevelDB to implement a cache for RSS and Atom formatted XML feeds. The keys are designed to stream feeds or entries in time ranges between now and some point in the past. The API speaks objects and JSON.

The distinction between feed and entries may seem dubious. A feed is the meta information of an RSS or Atom feed (title, author, published, etc.), while entries are the actual items in the feed. These are separated in manger to not repeatedly transmit feed information. Inherently manger tries to limit the number of requests and data transfers.

## types

### db()

A [LevelUP](https://github.com/rvagg/node-levelup) data store.

### mode()

A `Number(1 | 2 | 3)` to set manger's mode (optional).

- `1` ignore cached data and request all over the wire
- `2` retrieve data from cache if possible (default)
- `3` use `HEAD` requests comparing ETags to decide which feeds to update

### log()

The `console` module or a [bunyan](https://github.com/trentm/node-bunyan) instance for integrated error logging (optional).

### feed()

A container for metadata associated with the feed.

- `feed`
    - `author`
    - `copyright`
    - `feed`
    - `id`
    - `image`
    - `language`
    - `link`
    - `payment`
    - `subtitle`
    - `summary` 
    - `title`
    - `ttl`
    - `updated`

### enclosure()

A related resource of an entry().

- `enclosure`
    - `href`
    - `length`
    - `type`

### entry()

An individual entry.

- `entry`
    - `author`
    - `enclosure()`
    - `duration`
    - `feed`
    - `id`
    - `image`
    - `link`
    - `subtitle`
    - `summary`
    - `title`
    - `updated`

## exports

`manger(db())` is similar to entries(opts()) but without the options.

### opts(db(), mode(), log())

Bag of options, where only `db` is required. Remember that a LevelDB database cannot be opened by multiple Node processes at once.

### entries(opts())

The entries duplex stream emits JSON buffers encoding an array of `entry()`objects.

### feeds(opts())

The feed duplex stream emits JSON buffers encoding an array of `feed()`objects.

### update(opts())

The update function updates the whole store, it returns a readable stream of the updated feed() objects. Manger performs `HEAD` requests with all feed URLs in the store, and after comparing the server side ETags with the stored ETags, updates the entries for all feeds. Previous values with the identical keys are overwritten. The keys are generated from the URLs of the feeds and the entries respectivly. Nothing gets deleted or synced.  

### list(opts())

A readable stream of URL String() of all subscribed feeds in the store. 

### queries()

A convenience duplex stream to transform JSON strings to manger queries. The stream expects input of the form:

```js
'[{"url": "http://5by5.tv/rss", "since": "2014-06"}, ...]'
```

This makes it easy to pipe to manger (`http` requests, say):

```js
http.request()
  .pipe(manger.queries())
  .pipe(manger.entries(manger.opts())
```

## Installation

[![NPM](https://nodei.co/npm/manger.svg)](https://npmjs.org/package/manger)

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)
