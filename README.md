# manger - cache feeds

The **manger** [Node](http://nodejs.org/) package caches RSS and Atom formatted XML feeds using [LevelUP](https://github.com/rvagg/node-levelup). It provides an interface to query entries by feed and time.

[![Build Status](https://secure.travis-ci.org/michaelnisi/manger.svg)](http://travis-ci.org/michaelnisi/manger)

## types

### str()

[`String()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | `undefined`

### feed()

One metadata object per XML feed.

- `author str()`
- `copyright str()`
- `feed str()`
- `id str()`
- `image str()`
- `language str()`
- `link str()`
- `payment str()`
- `subtitle str()`
- `summary str()`
- `title str()`
- `ttl str()`
- `updated str()`

### enclosure()

A related resource of an entry().

- `href str()`
- `length str()`
- `type str()`

### entry()

An individual entry.

- `author str()`
- `enclosure enclosure() | undefined`
- `duration str()`
- `feed str()`
- `id str()`
- `image str()`
- `link str()`
- `subtitle str()`
- `summary str()`
- `title str()`
- `updated str()`

### query()

A query to get a feed or entries of a feed in a time range between `Date.now()` and `since`.

- `url String()`
- `since Date() | undefined`
- `etag String() | undefined` An [entity tag](http://en.wikipedia.org/wiki/HTTP_ETag)
- `force Boolean() | false` Force update ignoring cache

### opts()

Options for a `Manger` instance.

- `readableObjectMode Boolean() | false`

## exports

### manger(name, opts)

- `name String()` The name of the file system directory for the database
- `opts opts()`

The **manger** module exports a single function that returns a new `cache` object (an instance of `Manger`). To access the `Manger` class `require('manger')`.

```js
var manger = require('manger')
var cache = manger('/tmp/manger.db')
```

If options has `readableObjectMode` set to `true`, results are read as `Object` types, otherwise they are `Buffer` or `String` moulding valid JSON, depending of which stream of the API is used.

**manger** leverages the lexicographical key sort order of [LevelDB](http://leveldb.org/). The keys are designed to stream feeds or entries in time ranges between now and some point in the past.

The distinction between feed and entries may not be clear. A feed models the metadata of an RSS or Atom feed (title, author, published, etc.), while entries are the actual items in the feed. These are detached to not repeatedly transmit feed metadata—after all **manger** tries to save round-trips.

### cache.entries()

A [Transform](http://nodejs.org/api/stream.html#stream_class_stream_transform) stream that transforms queries or URLs to entries.

- `write(Buffer() | String() | query())` returns `Boolean()`
- `read()` returns `Buffer() | String() | entry()`

### cache.feeds()

A [Transform](http://nodejs.org/api/stream.html#stream_class_stream_transform) stream that transforms queries or URL strings to feeds.

- `write(query() | String())` returns `Boolean()`
- `read()` returns `Buffer() | String() | feed()`

### cache.list()

A [Readable](http://nodejs.org/api/stream.html#stream_class_stream_readable_1) stream of URLs of all feeds currently cached.

- `read() Buffer() | String()`

### cache.update()

Updates all cached feeds and returns a [Readable](http://nodejs.org/api/stream.html#stream_class_stream_readable_1) stream `feed()` objects representing feeds that have been updated. This is a serial—potentially long running—operation. If possible feeds are updated ordered by popularity.

- `read() Buffer() | String() | feed()`

### cache.ranks()

A [Readable](http://nodejs.org/api/stream.html#stream_class_stream_readable_1) stream of URLs sorted by rank (highest first).

- `read() Buffer() | String()`

### cache.resetRanks()

Resets the ranks index.

### cache.flushCounter()

**manger** keeps an in-memory count of how many times feeds are accessed. This function flushes the counter to disk updating the ranks index.

## additional exports

The **manger** module decorates the exported `Manger` constructor with some convencience functions for querying.

### manger.query(url, since, etag, force)

A failable `query()` factory function returning a valid `query()` or `null`.

### manger.queries()

A convenience transform of JSON string buffers to queries which can be piped to `feeds()` and `entries()` streams.

## Installation

With [npm](https://npmjs.org/package/manger) do:

```
$ npm install manger
```

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)
