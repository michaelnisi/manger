# manger - cache feeds 

The manger [Node.js](http://nodejs.org/) module caches RSS and Atom formatted XML feeds using [LevelUP](https://github.com/rvagg/node-levelup). But not only does it cache, it supports aggregated requests with individual time intervals (from now). I wrote it for a mobile client which needs to get all updated entries of multiple feeds and time spans with a single request.

[![Build Status](https://secure.travis-ci.org/michaelnisi/manger.png)](http://travis-ci.org/michaelnisi/manger) [![David DM](https://david-dm.org/michaelnisi/manger.png)](http://david-dm.org/michaelnisi/manger)

## Usage

### Pipe stdin

```js
var manger = require('../')
  , levelup = require('levelup')

levelup(loc(), null, function (er, db) {
  process.stdin
    .pipe(manger.queries())
    .pipe(manger.entries(manger.opts(db)))
    .pipe(process.stdout)
})

function loc () {
  return '/tmp/mangerdb'
}
```
To try above on the command-line, pipe to [json](https://github.com/trentm/json) like so:
```
cat example/5by5.json | node example/stdin.js | json
```

### Manual queries
```js
var manger = require('manger')
  , levelup = require('levelup')

levelup(loc(), null, function (er, db) {
  var opts = manger.opts(db)
    , writer = manger.feeds(opts) // manger.entries(opts)
    , queries = queries()
    , i = queries.length

  writer.pipe(process.stdout)

  ;(function write () {
    var ok = true
    do { ok = writer.write(queries[--i]) } while (i > 0)
  })()
  i > 0 ? writer.once('drain', write) : writer.end()

  function queries () {
    return [
      ['http://feeds.muleradio.net/thetalkshow']
    , ['http://feeds.muleradio.net/mistakes']
    ]
  }
})

function loc () {
  return '/tmp/mangerdb'
}
```
To see this, try:
```
node example/feeds.js | json -a title
```

### HTTP Server
```js
var http = require('http')
  , levelup = require('levelup')
  , routes = require('routes')()
  , assert = require('assert')
  , manger = require('manger')

levelup(loc(), null, start)

function loc () {
  return '/tmp/mangerdb'
}

var opts
function decorate (req, db) {
  opts = opts || manger.opts(db)
  req.opts = opts
  return req
}

function route (req, res) {
  var rt = routes.match(req.url)
    , fn = rt ? rt.fn : null
  if (fn) {
    fn(req, res)
  } else {
    res.writeHead(404)
    res.end('not found\n')
  }
}

function start (er, db) {
  assert(!er)
  routes.addRoute('/feeds', feeds)
  routes.addRoute('/entries', entries)
  routes.addRoute('/update', update)
  http.createServer(function (req, res) {
    route(decorate(req, db), res)
  }).listen(1337)
}

function feeds (req, res) {
  req
    .pipe(manger.queries())
    .pipe(manger.feeds(req.opts))
    .pipe(res)
}

function entries (req, res) {
  req
    .pipe(manger.queries())
    .pipe(manger.entries(req.opts))
    .pipe(res)
}

function update (req, res) {
  manger.update(req.opts)
    .pipe(res)
}
```

You might try this server (after you'd `npm install`) by doing:
```
node example/server.js &
```
Get feeds:
```
curl -sS -d '[{"url":"feeds.muleradio.net/thetalkshow"}, {"url":"http://5by5.tv/hd"}]' \ 
  http://localhost:1337/feeds | json
```
Get Entries:
```
curl -sS -d '[{"url":"http://feeds.5by5.tv/b2w"}, {"url":"http://5by5.tv/dlc"}]' \ 
  http://localhost:1337/entries | json
```
Get Entries within time interval from now to since:
```
curl -sS -d '[{"url":"http://5by5.tv/rss", "since":1391212800000}]' \
  http://localhost:1337/entries
```
Update all the things (confining output to titles):
```
curl -sS http://localhost:1337/update | json -a title
```

## API

The manger module leverages the lexicographical key sort order of Leveldb to implement a cache for RSS and Atom formatted XML feeds. The keys are optimized to stream feeds or entries in time ranges between now and some point in the past. The API speaks JSON.

The distinction between feed and entries may seem dubious. A feed is the meta information of an RSS or Atom feed (title, author, published, etc.), while entries are the actual items in the feed. These are separated in manger to not repeatedly transmit feed information. Essentially this package tries to limit the number of requests and data transfers.

In the default mode(`3`) all data is retrieved from the cache, if a requested feed isn't cached yet, it is requested and stored in the cache before it is returned. To keep the cache up to date the update function has to be applied regularly. This is an expensive operation which will harm performance if done too frequently.

It is possible to run manger functions in workers of a cluster: of course you have to provide each worker its own database, as LevelUP is an in-process database. The databases are not synced.

You can load manger functions by doing `require('manger')`.

### opts(db, mode, log)
- `db` [levelup()](https://github.com/rvagg/node-levelup)
- `mode` mode() `1 | 2`
- `log` [bunyan()](https://github.com/trentm/node-bunyan)

Bag of options, where only `db` is required. Remember that a database cannot be opened by parallel Node processes.

- mode() Set mode to `1`, if cache should be forcefully refreshed, set to `2` to retrieve cached data only. In the default mode(`3`) manger uses `HEAD` requests comparing ETags to decide which feeds need to be updated. Usually users don't have to set mode.

### entries(opts())

The entries duplex stream is a stream of entries which are defined by [pickup](https://github.com/michaelnisi/pickup) (a streaming parser).

- [entry()](https://github.com/michaelnisi/pickup#evententry)
- time() Unix Time || IETF-compliant RFC 2822 timestamp
- tuple() [String(), time()]

Write tuples to it:

- tuple()

And read a JSON string from it:
```js
'[entry(), ...]'
```

### feeds(opts())

The feeds duplex stream is a stream of feeds, like entries, these are also products of the pickup package.

- [feed()](https://github.com/michaelnisi/pickup#eventfeed)

Write tuples to it:

- tuple()

And read a JSON string from it:
```js
'[feed(), ...]'
```

### update(opts())

The update function updates the whole cache, it returns a readable stream of the updated feed() objects. Manger performs `HEAD` requests with all feed URLs in the store, and after comparing the server side ETags with the stored ETags, updates the entries for all feeds. Previous values with the identical keys are overwritten. The keys are generated from the URLs of the feeds and the entries respectivly. Nothing gets deleted or synced.  

### queries()

A convenience duplex stream to transform JSON strings to manger tuples. Write JSON strings or buffers with content of following format:
```js
[{"url":String(), "since":Date.UTC()}, ...]
```
and read tuple(). 

The stream applies 'data' listeners with one tuple() per event. 
```js
queries().on('data', function (tuple) { ... })
```

This lets you conveniently pipe (or write) request bodies to manger:

```js
http.request()
  .pipe(manger.queries())
  .pipe(manger.entries(manger.opts())
```

## Installation

[![NPM](https://nodei.co/npm/manger.png)](https://npmjs.org/package/manger)

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)

