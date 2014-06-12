
// manger - cache feeds

module.exports = manger

module.exports.entries = Entries
module.exports.feeds = Feeds
module.exports.list = list
module.exports.opts = Opts
module.exports.update = update

var queries = require('./lib/queries')
module.exports.queries = queries
module.exports.query = queries.query

var assert = require('assert')
  , duplexer = require('duplexer')
  , http = require('http')
  , keys = require('./lib/keys')
  , pickup = require('pickup')
  , requests = require('./lib/requests')
  , stream = require('stream')
  , string_decoder = require('string_decoder')
  , url = require('url')
  , util = require('util')
  ;

var debug
if (process.env.NODE_DEBUG || process.env.NODE_TEST) {
  debug = function (o) {
    console.error('**manger: %s', o)
  }
} else {
  debug = function () {}
}

var Mode = {
  WIRE:  1
, CACHE: 2
, HEAD:  3
}

// Options to configure these streams.
// - db levelup()
// - mode Mode
// - log bunyan()
function Opts (db, mode, log) {
  if (!(this instanceof Opts)) return new Opts(db, mode, log)
  this.db = db
  this.mode = mode
  this.log = log
}

// Validate options and add default option values.
// - opts Opts()
function defaults (opts) {
  if (!opts || !opts.db) throw new Error('no db')
  return new Opts(opts.db, opts.mode || Mode.CACHE, opts.log)
}

// Abstract base class for manger transform streams.
// - Opts()
util.inherits(Manger, stream.Transform)
function Manger (opts) {
  if (!(this instanceof Manger)) return new Manger(opts)
  opts = defaults(opts)
  stream.Transform.call(this, opts)
  util._extend(this, opts)
  this._writableState.objectMode = true
  this._readableState.objectMode = false
  this.pushFeeds = false
  this.pushEntries = true
  this.state = 0
  this.run = [this.wire, this.cache, this.head][this.mode - 1]
}

Manger.prototype._flush = function (cb) {
  // TODO: Would new-line-seperated JSON be better?
  var chunk = this.state === 0 ? '[]' : ']'
  this.push(chunk)
  cb()
}

var CHARS = ['[', ',']
Manger.prototype.prepend = function (str) {
  var s = CHARS[this.state] + str
  if (this.state === 0) this.state = 1
  return s
}

Manger.prototype.destroy = function () {
  this.db = this.log = null
  free(this)
}

function stored (er, etag) {
  return !er && !!etag
}

Manger.prototype.wire = function (query, enc, cb) {
  this.request(query, cb)
}

Manger.prototype.cache = function (query, enc, cb) {
  var me = this
  getETag(this.db, query, function (er, etag) {
    if (!stored(er, etag)) {
      me.request(query, cb)
    } else {
      me.retrieve(query, cb)
    }
  })
}

Manger.prototype.head = function (query, enc, cb) {
  var me = this
  function go (fresh, query, cb) {
    fresh ? me.request(query, cb) : me.retrieve(query, cb)
  }
  getETag(me.db, query, function (er, etag) {
    if (stored(er, etag)) {
      requests.changed(etag, query.url, function (er, yes) {
        go(yes, query, cb)
      })
    } else {
      go(true, query, cb)
    }
  })
}

// Request over the wire or retrieve from store.
// - query query()
// Here the modes: 1 | 2 | 3 = wire | cache | head
Manger.prototype._transform = function (query, enc, cb) {
  if (!query.url) {
    cb(new Error('no url'))
    return
  }
  this.run(query, enc, cb)
}

Manger.prototype.uid = function (uri) {
  return [this.db.location, uri].join('~')
}

Manger.prototype.defer = function (query, cb) {
  var stream, me = this
  if (!!(stream = inFlight(me.uid(query.url)))) {
    function later () {
      stream.removeListener('end', later)
      me.retrieve(query, cb)
    }
    stream.on('end', later)
  }
  return !!stream
}

function decorate (res, query, cb) {
  res.query = query
  res.cb = cb
  return res
}

Manger.prototype.request = function (query, cb) {
  var me = this
  var req = http.get(query.url, function (res) {
    me.respond(decorate(res, query, cb))
  })
  function error (er) {
    req.removeListener('error', error)
    me.error(er)
    cb() // Keep calm and just continue with the next.
  }
  req.on('error', error)
}

Manger.prototype.respond = function (res) {
  var me = this
    , query = res.query
    , uri = query.url
    , cb = res.cb
    , parser = pickup()
    ;
  function onError (er) {
    me.error(er)
    cb(er)
  }
  function onFeed (feed) {
    feed.feed = uri
    feed.updated = time(feed)
    putFeed(me.db, uri, feed, function (er) {
      if (er) me.error(er)
      if (me.pushFeeds && newer(feed, query)) {
        me.push(me.prepend(JSON.stringify(feed)))
      }
    })
  }
  function onEntry (entry) {
    entry.feed = uri
    entry.updated = time(entry)
    putEntry(me.db, uri, entry, function (er) {
      if (er) me.error(er)
      if (me.pushEntries && newer(entry, query)) {
        me.push(me.prepend(JSON.stringify(entry)))
      }
    })
  }
  function onFinish () {
    putETag(me.db, uri, etag(res), function (er) {
      land(me.uid(uri))
      free(res, parser)
      if (er) me.error(er)
      cb(er)
    })
  }
  parser.on('error', onError)
  parser.on('feed', onFeed)
  parser.on('entry', onEntry)
  parser.on('finish', onFinish)

  fly(me.uid(uri), parser) // TODO: Wonky!
  res.pipe(parser).resume()
}

function etag(res) {
  return res.headers['etag']
}

Manger.prototype.toString = function () {
  return ['Manger ', this.constructor.name].join()
}

Manger.prototype.error = function (x) {
  if (this.log) this.log.error(x)
  debug(x)
}

Manger.prototype.info = function (x) {
  if (this.log) this.log.info(x)
  debug(x)
}

// A stream of feeds.
util.inherits(Feeds, Manger)
function Feeds (opts) {
  if (!(this instanceof Feeds)) return new Feeds(opts)
  Manger.call(this, opts)
  this.pushFeeds = true
  this.pushEntries = false
}

Feeds.prototype.retrieve = function (query, cb) {
  var me = this
    , db = me.db
    , key = keys.key(keys.FED, query)
    ;
  db.get(keys.key(keys.FED, query), function (er, val) {
    if (er) {
      me.error(er)
      if (er.notFound) {
        me.request(query, cb)
      } else {
        cb(er)
      }
    } else if (val) {
      me.push(me.prepend(val))
      cb()
    }
  })
}

// A stream of entries.
util.inherits(Entries, Manger)
function Entries (opts) {
  if (!(this instanceof Entries)) return new Entries(opts)
  Manger.call(this, opts)
}

// TODO: If the etags get out of sync, we're fucked!
Entries.prototype.retrieve = function (query, cb) {
  var me = this
    , start = keys.key(keys.ENT, query)
    , end = keys.key(keys.ENT, queries.query(query.url, Date.now()))
    , stream = me.db.createValueStream({start:start, end:end})
    ;
  function push (value) {
    var str = me.prepend(value)
    me.push(str)
  }
  function done () {
    stream.removeListener('data', push)
    stream.removeListener('error', me.error)
    stream.removeListener('end', done)
    cb()
  }
  stream.on('data', push)
  stream.on('error', me.error)
  stream.on('end', done)
}

function manger (db) {
  var input = queries()
    , opts = new Opts(db)
    , entries = new Entries(opts)
    ;
  input.pipe(entries)
  return duplexer(input, entries)
}

// List all feeds currently in store.
util.inherits(List, stream.Transform)
function List (opts) {
  if (!(this instanceof List)) return new List(opts)
  stream.Transform.call(this, opts)
}

List.prototype.decode = function (chunk) {
  var decoder = this.decoder
    || (this.decoder = new string_decoder.StringDecoder())
  return decoder.write(chunk)
}

List.prototype._transform = function (chunk, enc, cb) {
  var url = this.decode(chunk).split(keys.FED + keys.DIV)[1]
  this.push(url)
  cb()
}

function piperr () {
  Array.prototype.slice(arguments).forEach(function (stream) {
    stream.on('error', debug)
  })
}

// A readable stream of all subscribed feeds in the store.
function list (opts) {
  opts = defaults(opts)
  var read = opts.db.createKeyStream(keys.ALL_FEEDS)
    , write = new List({encoding:'utf8'})
    ;
  piperr(read, write)
  return read.pipe(write)
}

util.inherits(URLsToQueries, stream.Transform)
function URLsToQueries (opts) {
  if (!(this instanceof URLsToQueries)) return new URLsToQueries(opts)
  stream.Transform.call(this, opts)
  util._extend(this, opts)
  this._readableState.objectMode = true
  this.decoder = new string_decoder.StringDecoder()
}

URLsToQueries.prototype._transform = function (chunk, enc, cb) {
  var it
  try {
    it = queries.query(this.decoder.write(chunk))
  } catch (er) {
    cb(er)
  }
  this.push(it)
  cb()
}

// Updates entire store and returns readable stream of feeds.
function update (opts) {
  opts.mode = Mode.HEAD
  var urls = list(opts)
    , queries = new URLsToQueries(opts)
    , feeds = new Feeds(opts)
    ;
  urls.pipe(queries).pipe(feeds)
  return feeds
}

// TODO: Remove global state
// Dictionary of request streams currently in-flight
var _flights
function flights () {
  return _flights || (_flights = Object.create(null))
}

// - uid Manger.prototype.uid()
function inFlight (uid) {
  return flights()[uid]
}

function fly (uid, stream) {
  flights()[uid] = stream
}

function land (uid) {
  flights()[uid] = null
}

// Put entry into store.
// - db The database instance
// - uri The uri of the feed
// - entry The entry object
// - cb(er, key)
function putEntry (db, uri, entry, cb) {
  var key = keys.key(keys.ENT, queries.query(uri, entry.updated))
  entry.feed = uri
  db.put(key, JSON.stringify(entry), function (er) {
    cb(er, key)
  })
}

// Get stored entry.
// - db levelup()
// - query query()
// - cb cb(er, val)
function getEntry(db, query, cb) {
  db.get(keys.key(keys.ENT, query), cb)
}

// Put feed into store
// - db levelup()
// - uri String()
// - cb cb(er, key)
function putFeed(db, uri, feed, cb) {
  var key = keys.key(keys.FED, queries.query(uri))
  feed.feed = uri
  var data = JSON.stringify(feed)
  db.put(key, data, function (er) {
    cb(er, key)
  })
}

// Get stored feed.
// - db levelup()
// - uri http://example.org/feed.xml
// - cb cb(er, val)
function getFeed (db, uri, cb) {
  db.get(keys.key(keys.FED, queries.query(uri)), cb)
}

function putETag(db, uri, etag, cb) {
  db.put(keys.key(keys.ETG, queries.query(uri)), etag, cb)
}

// Get stored ETag for uri.
// - db levelup()
// - query query()
// - cb cb(er, val)
function getETag (db, query, cb) {
  db.get(keys.key(keys.ETG, query), cb)
}

// Free streams (passed as arguments).
function free () {
  Array.prototype.slice.call(arguments)
    .forEach(function (stream) {
      stream.unpipe()
      stream.removeAllListeners()
    })
}

// True if value is stale and should be updated.
// - val The value to check
// - mode The mode of the manger stream (1 | 2)
function stale (val, mode) {
  var cached = !!val
    , fresh  = mode === 1
    , cache  = mode === 2
    ;
  return (!cached || fresh) && !cache
}

// Normalize dates of feeds or entries.
// - thing feed() | entry()
function time (thing) {
  return queries.time(thing.updated)
}

function newer (item, query) {
  return item.updated > query.since
}

if (process.env.NODE_TEST) {
  [
    putETag
  , getETag
  , putFeed
  , getFeed
  , putEntry
  , getEntry
  , stale
  , flights
  , newer
  ].forEach(function (f) { module.exports[f.name] = f })
}
