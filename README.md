# manger - cache feeds

The **manger** [Node](http://nodejs.org/) package caches RSS and Atom formatted XML feeds using [LevelUP](https://github.com/rvagg/node-levelup). It provides an interface to query entries by feed and time.

[![Build Status](https://secure.travis-ci.org/michaelnisi/manger.svg)](http://travis-ci.org/michaelnisi/manger)

## Types

### void()

`null | undefined`

### str()

An optional [`String()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String).

`String() | void()`

### feed()

One metadata object per XML feed.

- `author` `str()`
- `copyright` `str()`
- `feed` `str()`
- `id` `str()`
- `image` `str()`
- `language` `str()`
- `link` `str()`
- `payment` `str()`
- `subtitle` `str()`
- `summary` `str()`
- `title` `str()`
- `ttl` `str()`
- `updated` `str()`

### enclosure()

A related resource of an `entry()`.

- `href` `str()`
- `length` `str()`
- `type` `str()`

### entry()

An individual entry.

- `author` `str()`
- `enclosure enclosure() | void()`
- `duration` `str()`
- `feed` `str()`
- `id` `str()`
- `image` `str()`
- `link` `str()`
- `subtitle` `str()`
- `summary` `str()`
- `title` `str()`
- `updated` `str()`

### query()

A query to get a feed or entries of a feed in a time range between `Date.now()` and `since`.

- `url` `String()`
- `since` [`Date()`](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Date) `| void()`
- `etag` `String() | void()` An [entity tag](http://en.wikipedia.org/wiki/HTTP_ETag)
- `force` [`Boolean()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)` | false` Force update ignoring cache

### opts()

Options for a `Manger` instance.

- `cacheSize` [`Number()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) `| 8 * 1024 * 1024` Passed to [levelup()](https://github.com/Level/levelup#ctor)
- `objectMode` `Boolean() | false` Return objects instead of buffers

## Exports

### manger(name, opts)

- `name` `String()` The name of the file system directory for the database
- `opts` `opts()`

The **manger** module exports a single function that returns a new `cache` object (an instance of `Manger`). To access the `Manger` class `require('manger')`.

```js
var manger = require('manger')
var cache = manger('/tmp/manger.db')
```

If `opts` has `objectMode` set to `true`, results are read as `Object` types, instead of [`Buffer`](https://nodejs.org/api/buffer.html) moulding valid [JSON](http://json.org/).

**manger** leverages the lexicographical key sort order of [LevelDB](http://leveldb.org/). The keys are designed to stream feeds or entries in time ranges between now and some user defined point in the past.

The distinction between feed and entries might be unclear. A feed models the metadata of an RSS or Atom feed (title, author, published, etc.), while entries are the actual items in the feed. These are detached to not repeatedly transmit feed metadata—after all **manger** tries to save round-trips.

### cache.entries()

A [Transform](http://nodejs.org/api/stream.html#stream_class_stream_transform) stream that transforms queries or URLs to entries.

- `write(Buffer() | String() | query())`
- `read()` `Buffer() | entry()`

### cache.feeds()

A stream that transforms queries or URL strings to feeds.

- `write(query() | String())`
- `read()` `Buffer() | String() | feed()`

### cache.list()

A [Readable](http://nodejs.org/api/stream.html#stream_class_stream_readable_1) stream of URLs of all feeds currently cached.

- `read()` `Buffer() | str()`

### cache.update(x)

- `x` `Number() | 5` The number of streams to engage concurrently

Updates all ranked feeds and returns a stream that emits feed URLs of updated feeds. This, of course, could produce a resource heavy operation! Feeds are updated ordered by their popularity, using the rank index, therefore `flushCount` has to be invoked before this method can take any effect.

- `read()` `str()`

### cache.ranks()

A stream of URLs sorted by rank (highest first).

- `read()` `Buffer() | String() | null`

### cache.resetRanks(cb)

Resets the ranks index.

- `cb` [`Function`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function)`(error)` The callback
  - `error` [`Error()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) `| void()` The possible error

### cache.flushCounter(cb)

- `cb` `Function(error, count) | void()` The callback
  - `error` `Error() | void()` The possible error
  - `count` `Number()` Total number of cached feeds

**manger** keeps an in-memory count of how many times feeds have been accessed. This function flushes the counter to disk, updating the ranks index.

### cache.has(url, cb)

Applies callback `cb` without arguments if a feed with this `url` is cached.

- `url` `String()` The URL of the feed
- `cb` `Function(error) | void()` The callback
  - `error` `Error() | void()` The possible error

### cache.remove(url, cb)

Attempts to remove a feed matching the `url` from the cache and applies callback without `error` if this succeeds.

- `url` `String()` The URL of the feed
- `cb` `Function(error) | void()` The callback
  - `error` `Error() | void()` The possible error

## Additional exports

The **manger** module decorates the exported `Manger` constructor with two convenience functions for querying the cache.

### manger.query(url, since, etag, force)

A failable factory function returning a valid [`query()`](#query) or `void()`.

### manger.queries()

This stream transforms JSON to queries which can be piped to `feeds()` and `entries()` streams. The expected JSON input format:

```js
[
  { "url": "http://feeds.5by5.tv/directional" },
  { "url": "http://www.newyorker.com/feed/posts",
    "since": 1433083971124 },
  { "url": "https://www.joyent.com/blog/feed",
    "since": "May 2015" },
  ...
]
```

Where `"since"` can be anything `Date()` is able to parse.

## Installation

With [npm](https://npmjs.org/package/manger) do:

```
$ npm install manger
```

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)
