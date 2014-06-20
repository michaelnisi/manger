
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
  , zlib = require('zlib')
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
// - log bunyan() | console
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
  return new Opts(
    opts.db
  , opts.mode || Mode.CACHE
  , opts.log || { error:function () {} })
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
  this.unpipe()
  this.removeAllListeners()
}

Manger.prototype.wire = function (query, enc, cb) {
  this.request(query, cb)
}

function stored (er, thing) {
  return !er && !!thing
}

Manger.prototype.cache = function (query, enc, cb) {
  var me = this
  getETag(this.db, query, function (er, etag) {
    if (!!er) me.error(er)
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
    if (!!er) me.error(er)
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
Manger.prototype._transform = function (query, enc, cb) {
  if (!query.url) {
    var er = new Error('no url')
    this.error(er)
    cb(er)
  } else {
    this.run(query, enc, cb)
  }
}

Manger.prototype.uid = function (uri) {
  return [this.db.location, uri].join('~')
}

Manger.prototype.defer = function (query, cb) {
  var stream
    , me = this
    ;
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
    cb()
  }
  req.on('error', error)
}

Manger.prototype.respond = function (res) {
  var me = this
    , query = res.query
    , uri = query.url
    , cb = res.cb
    , parser = pickup()
    , unzip = null
    , count = 0
    , finished = false
    ;
  function free () {
    assert(count === 0) // Obey me
    if (unzip) {
      unzip.removeAllListeners()
    }
    parser.removeAllListeners()
    land(me.uid(uri))
    res = null
    me = null
    query = null
    uri = null
    cb = null
    parser = null
    unzip = null
    finished = false
  }
  function done () {
    cb()
    free()
  }
  // Abort but ignore externally.
  function onError (er) {
    me.error(er)
    count = 0
    done()
  }
  function onFeed (feed) {
    count++
    feed.feed = uri
    feed.updated = time(feed)
    putFeed(me.db, uri, feed, function (er) {
      count--
      if (!!er) me.error(er)
      if (me.pushFeeds && newer(feed, query)) {
        me.push(me.prepend(JSON.stringify(feed)))
      }
      if (finished && count === 0) done()
    })
  }
  function onEntry (entry) {
    count++
    entry.feed = uri
    entry.updated = time(entry)
    putEntry(me.db, uri, entry, function (er) {
      count--
      if (!!er) me.error(er)
      if (me.pushEntries && newer(entry, query)) {
        me.push(me.prepend(JSON.stringify(entry)))
      }
      if (finished && count === 0) done()
    })
  }
  function onFinish () {
    function finish () {
      if (count === 0) done()
      finished = true
    }
    putETag(me.db, uri, etag(res), function (er) {
      if (!!er) me.error(er)
      finish()
    })
  }
  parser.on('error', onError)
  parser.on('feed', onFeed)
  parser.on('entry', onEntry)
  parser.on('finish', onFinish)

  fly(me.uid(uri), parser) // TODO: Wonky!

  function stream () {
    if (res.headers['content-encoding'] === 'gzip') {
      unzip = zlib.createGunzip()
      unzip.on('error', onError)
    }
    return !!unzip ? res.pipe(unzip).pipe(parser) : res.pipe(parser)
  }

  stream().resume()
}

function etag(res) {
  var h = res.headers
  return h['etag'] || h['Etag'] || h['ETag'] || h['ETAG'] || 0
}

Manger.prototype.toString = function () {
  return ['Manger ', this.constructor.name].join()
}

Manger.prototype.error = function (x) {
  if (!!x && x.notFound) return
  this.log.error(x)
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
  function error (er) {
    console.error(er)
  }
  [input, entries].forEach(function (eve) { eve.on('error', error) })
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

// A readable stream of all subscribed feeds in the store.
function list (opts) {
  opts = defaults(opts)
  var read = opts.db.createKeyStream(keys.ALL_FEEDS)
    , write = new List({encoding:'utf8'})
    ;
  function error (er) {
    opts.log.error(er)
  }
  [read, write].forEach(function (eve) { eve.on('error', error) })
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
  function error (er) {
    opts.log.error(er)
  }
  [urls, queries, feeds].forEach(function (eve) { eve.on('error', error) })
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

// Normalize dates of feeds or entries.
// - thing feed() | entry()
function time (thing) {
  return queries.time(thing.updated)
}

function newer (item, query) {
  return item.updated >= query.since
}

if (process.env.NODE_TEST) {
  [putETag
 , getETag
 , putFeed
 , getFeed
 , putEntry
 , getEntry
 , flights
 , newer].forEach(function (f) { module.exports[f.name] = f })
}
