
# manger - cache feeds

The **manger** [Node](http://nodejs.org/) module caches RSS and Atom formatted XML feeds using [LevelUP](https://github.com/rvagg/node-levelup). It supports aggregated requests with individual time intervals. I wrote it to aggregate all updated entries of multiple feeds and time spans into a single request-response. **manger** leverages the lexicographical key sort order of [LevelDB](http://leveldb.org/). The keys are designed to stream feeds or entries in time ranges between now and some point in the past.

[![Build Status](https://secure.travis-ci.org/michaelnisi/manger.svg)](http://travis-ci.org/michaelnisi/manger)

## types

### db()

A [LevelUP](https://github.com/rvagg/node-levelup) data store.

### opts()

Bag of options for a `Manger` instance.

```js
- db db()
- readableObjectMode Boolean() | false
```

### feed()

One metadata object per XML feed.

```js
- author String() | undefined
- copyright String() | undefined
- feed String() | undefined
- id String() | undefined
- image String() | undefined
- language String() | undefined
- link String() | undefined
- payment String() | undefined
- subtitle String() | undefined
- summary String() | undefined
- title String() | undefined
- ttl String() | undefined
- updated String() | undefined
```
### enclosure()

A related resource of an entry().

```js
- href String() | undefined
- length String() | undefined
- type String() | undefined
```

### entry()

An individual entry.

```js
- author String() | undefined
- enclosure enclosure() | undefined
- duration String() | undefined
- feed String() | undefined
- id String() | undefined
- image String() | undefined
- link String() | undefined
- subtitle String() | undefined
- summary String() | undefined
- title String() | undefined
- updated String() | undefined
```

### query()

```js
- url String()
- since Date() | undefined
```

## exports


The distinction between feed and entries may appear vague. A feed models the metadata of an RSS or Atom feed (title, author, published, etc.), while entries are the actual items in the feed. These are separated in manger to not repeatedly transmit feed metadata—after all **manger** tries to save round-trips.

The **manger** module exports a single function that returns a new `cache` object (an instance of `Manger`). To access the `Manger` class `require('manger')`. If the cache's `readableObjectMode` is set to `true`, results can be read as objects, otherwise as `Buffer` objects or strings forming an array in proper JSON.

### cache.entries()

A [Transform](http://nodejs.org/api/stream.html#stream_class_stream_transform) stream that transform queries or URL strings to entries.

```js
- write(query() || String()) Boolean()
```

### cache.feeds()

A [Transform](http://nodejs.org/api/stream.html#stream_class_stream_transform) stream that transform queries or URL strings to feeds.

```js
- write(query() || String()) Boolean()
```

### cache.list()

A [Readable](http://nodejs.org/api/stream.html#stream_class_stream_readable_1) stream of URLs of all feeds currently cached.

```js
- read() Buffer() || String()
```

### cache.update()

Updates all cached feeds and returns a [Readable](http://nodejs.org/api/stream.html#stream_class_stream_readable_1) stream of updated feed objects.

```js
- read() Buffer() || String() || feed()
```

## Installation

With [npm](https://npmjs.org/package/manger) do:

```
$ npm install manger
```

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)
