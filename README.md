[![Build Status](https://secure.travis-ci.org/michaelnisi/manger.svg)](http://travis-ci.org/michaelnisi/manger)
[![Coverage Status](https://coveralls.io/repos/github/michaelnisi/manger/badge.svg?branch=master)](https://coveralls.io/github/michaelnisi/manger?branch=master)

# manger - cache feeds

The **manger** [Node.js](http://nodejs.org/) package provides caching for RSS and Atom formatted XML feeds, it implements an interface to query entries by feed and time.

## Types

### void()

`null | undefined` Absence of any object value, intentional or not.

### str()

`String() | void()` An optional [`String()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String).

### feed()

One metadata object per XML feed.

- `author` `str()`
- `copyright` `str()`
- `id` `str()`
- `image` `str()`
- `language` `str()`
- `link` `str()`
- `originalURL` `str()`
- `payment` `str()`
- `subtitle` `str()`
- `summary` `str()`
- `title` `str()`
- `ttl` `str()`
- `updated` `Number()`
- `url` `str()`

### enclosure()

A related resource of an `entry()`.

- `href` `str()`
- `length` `Number()`
- `type` `str()`

### html()

A sanitized HTML `String()` with a limited set of tags: `'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol', 'li', 'b', 'i', 'strong', 'em', 'code', 'br', 'div', 'pre'`.

### entry()

An individual entry.

- `author` `str()`
- `duration` `Number() | null` The value of the `<itunes:duration>` tag in seconds or `null`.
- `enclosure` `enclosure() | void()`
- `id` `String()` A globally unique, not the original, identifier for this entry.
- `image` `str()`
- `link` `str()`
- `originalURL` `str()` The originally requested URL.
- `subtitle` `str()`
- `summary` `html() | void()`
- `title` `str()`
- `updated` `str()`
- `url` `str()` The URL of this entry’s feed.

Why does **manger** use cryptographic hash algorithm, SHA-1, to produce the `id` property?

> Having a good hash is good for being able to trust your data, it happens to have some other good features, too, it means when we hash objects, we know the hash is well distributed and we do not have to worry about certain distribution issues.

Read more [here](https://stackoverflow.com/questions/28792784/why-does-git-use-a-cryptographic-hash-function).

### query()

A query to get a feed or entries of a feed in a time range between `Date.now()` and `since`. Conceptually consequent, but semantically inaccurate, the `since` date is exclusive. If you pass the `updated` date of the latest entry received, this entry will not be included in the response.

- `url` `String()`
- `since` [`Date()`](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Date) `| void()`
- `etag` `String() | void()` An [entity tag](http://en.wikipedia.org/wiki/HTTP_ETag)
- `force` [`Boolean()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)` | false` Force update ignoring cache

### nop()

`function () {}` No Operation.

### opts()

Options for a `Manger` instance.

- `cacheSize = 16 * 1024 * 1024` [LevelDB](https://github.com/google/leveldb) cache size for uncompressed blocks.
- `counterMax = 500` Limits the items in the ranks counter.
- `failures = { set: nop, get: nop, has: nop }` LRU cache for failures.
- `force = false` A flag to bypass cached data entirely.
- `highWaterMark` Buffer level when `stream.write()` starts returning `false`.
- `isEntry = function (entry) { return true }` A function to validate entries.
- `isFeed = function (feed) { return true }` A function to validate feeds.
- `objectMode = false` Read `Object()` instead of `Buffer()`.
- `redirects = { set: nop, get: nop, has: nop }` LRU cache for redirects.

## Exports

### manger(name, opts())

The **manger** module exports a single function that returns a new `cache` object (an instance of `Manger`). To access the `Manger` class `require('manger')`.

- `name` `String()` The name of the file system directory for the database
- `opts` `opts()`

If `opts` has `objectMode` set to `true`, results are read as `Object` types, instead of [`Buffer`](https://nodejs.org/api/buffer.html), moulding valid [JSON](http://json.org/).

**manger** leverages the lexicographical key sort order of [LevelDB](http://leveldb.org/). The keys are designed to stream feeds or entries in time ranges between now and some user defined point in the past.

The distinction between feed and entries might be unclear: a feed models the metadata of an RSS or Atom feed (title, author, published, etc.), while entries are the actual items in the feed. These are detached to not repeatedly transmit feed metadata—after all **manger** tries to reduce round-trips.

Let’s create a **manger** instance named `cache` to document the API:

```js
const manger = require('manger')
const cache = manger('/tmp/manger.db')
```

### cache.entries()

A [Transform](http://nodejs.org/api/stream.html#stream_class_stream_transform) stream that transforms queries or URLs to entries.

- `write(Buffer() | String() | Object() | query())`
- `read()` `Buffer() | entry()`

### cache.feeds()

A stream that transforms queries or URL strings to feeds.

- `write(query() | String())`
- `read()` `Buffer() | String() | Object() | feed()`

### cache.list()

A [Readable](http://nodejs.org/api/stream.html#stream_class_stream_readable_1) stream of URLs of all feeds currently cached.

- `read()` `Buffer() | str()`

### cache.update(concurrencyLevel = 1)

- `concurrencyLevel` `Number()` Tune the number of concurrent streams.

Updates all ranked feeds and returns a stream that emits feed URLs of updated feeds. This, of course, could produce a resource heavy operation! Feeds are updated ordered by their popularity, using the rank index, therefor `flushCounter` must have been invoked before this method takes any effect. With `concurrencyLevel` you can choose how many transform streams will be used to concurrently do the work.

- `read()` `str()`

### cache.ranks(limit)

A stream of URLs sorted by rank (highest first).

- `limit` `Number()` Optionally, limit the number of URLs.

This stream lets you:

- `read()` `Buffer() | str()`

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

#### Event: 'hit'

- `query()` The query hitting the cache.

Making sure you feel good about yourself.

## Additional exports

The **manger** module decorates the exported `Manger` constructor with two convenience functions for querying the cache.

### manger.query(url, since, etag, force)

A failable factory function returning a valid [`query()`](#query) or `null`.

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

#### Event: 'warn'

To make piping easier, not breaking pipes, the queries stream emits a `'warning'` event instead of an `'error'` event if it encounters an invalid query. General stream errors, of course, are still emitted nevertheless.

## Installation

With [npm](https://npmjs.org/package/manger), do:

```
$ npm install manger
```

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)
