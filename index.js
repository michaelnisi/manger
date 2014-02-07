
// manger - cache feeds

module.exports.opts = Opts
module.exports.feeds = FeedStream
module.exports.entries = EntryStream
module.exports.update = update
module.exports.queries = require('./lib/queries').queries

if (process.env.NODE_TEST) {
  module.exports.putETag = putETag
  module.exports.getETag = getETag
  module.exports.putFeed = putFeed
  module.exports.getFeed = getFeed
  module.exports.putEntry = putEntry
  module.exports.getEntry = getEntry
  module.exports.stale = stale
  module.exports.newer = newer
  module.exports.flights = flights
}

var pickup = require('pickup')
  , http = require('http')
  , assert = require('assert')
  , stream = require('stream')
  , util = require('util')
  , url = require('url')
  , string_decoder = require('string_decoder')
  , keys = require('./lib/keys')
  , requests = require('./lib/requests')

var debug
if (process.env.NODE_DEBUG || process.env.NODE_TEST) {
  debug = function (o) { console.error('**manger: %s', o) }
} else {
  debug = function () { }
}

// @doc
function mode (k) {
  return {
    'fresh': 1
  , 'cache': 2
  , 'smart': 3
  }[k]
}

// Options
// - db levelup()
// - mode mode()
// - log bunyan()
function Opts (db, mode, log) {
  if (!(this instanceof Opts)) return new Opts(db, mode, log)
  this.db = db
  this.mode = mode
  this.log = log
}

// Abstract base class for manger transforms
// - Opts()
util.inherits(ATransform, stream.Transform)
function ATransform (opts) {
  if (!(this instanceof ATransform)) return new ATransform(opts)
  stream.Transform.call(this)
  this._writableState.objectMode = true
  this._readableState.objectMode = false
  this.pushFeeds = false
  this.pushEntries = true
  this.db = opts.db
  this.mode = opts.mode || 1 | 2
  this.log = opts.log
  this.state = 0
}

ATransform.prototype._flush = function (cb) {
  var chunk = this.state === 0 ? '[]' : ']'
  this.push(chunk)
  cb()
}

var MODS = ['[', ',']

ATransform.prototype.prepend = function (str) {
  var s = MODS[this.state] + str
  if (this.state === 0) this.state = 1
  return s
}

ATransform.prototype.destroy = function () {
  this.db = null
  this.log = null
  release([this])
}

// - tuple tuple()
function uri (tuple) {
  return tuple[0]
}

// @doc
// - uri Uniform resource identifier
// - time Coordinated Universal Time (optional)
function tuple (uri, time) {
  return [uri, time || Date.UTC(1970, 0)]
}

// Request over the wire or retrieve from store.
// - tuple tuple()
ATransform.prototype._transform = function (tuple, enc, cb) {
  var me = this
  getETag(me.db, uri(tuple), function (er, etag) {
    var mode = me.mode
    if (mode === 2 || mode !== 1 && !er && etag) {
      me.retrieve(tuple, cb)
    } else {
      requests.changed(etag, uri(tuple), function (er, yes) {
        if (yes) {
          me.request(tuple, cb)
        } else {
          me.retrieve(tuple, cb)
        }
      })
    }
  })
}

ATransform.prototype.uid = function (uri) {
  return [this.db.location, uri].join('~')
}

ATransform.prototype.defer = function (tuple, cb) {
  var stream, me = this
  if (!!(stream = inFlight(me.uid(tuple[0])))) {
    function later () {
      stream.removeListener('end', later)
      me.retrieve(tuple, cb)
    }
    stream.on('end', later)
  }
  return !!stream
}

ATransform.prototype.request = function (tuple, cb) {
  var me = this
  var req = http.get(uri(tuple), function (res) {
    me.respond(decorate(res, tuple, cb))
  })
  function error (er) {
    req.removeListener('error', error)
    me.error(er)
    cb() // TODO: Review
  }
  req.on('error', error)
}

function decorate (res, tuple, cb) {
  res.tuple = tuple
  res.cb = cb
  return res
}

ATransform.prototype.respond = function (res) {
  var me = this
    , tuple = res.tuple
    , uri = res.tuple[0]
    , cb = res.cb
    , parser = pickup()

  function onError (er) {
    me.error(er)
  }

  function onFeed (feed) {
    feed.feed = uri // TODO: Better name
    if (me.pushFeeds) {
      me.push(me.prepend(JSON.stringify(feed)))
    }
    putFeed(me.db, uri, feed, function (er) {
      if (er) me.error(er)
    })
  }

  function onEntry (entry) {
    entry.feed = uri // just so we know
    if (me.pushEntries && newer(date(entry), tuple)) {
      me.push(me.prepend(JSON.stringify(entry)))
    }
    putEntry(me.db, uri, entry, function (er) {
      if (er) me.error(er)
    })
  }

  function onFinish () {
    res.unpipe()
    parser.removeListener('error', onError)
    parser.removeListener('feed', onFeed)
    parser.removeListener('entry', onEntry)
    parser.removeListener('finish', onFinish)
    putETag(me.db, uri, etag(res), function (er) {
      if (er) me.error(er)
      land(me.uid(uri))
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

ATransform.prototype.toString = function () {
  return ['Manger ', this.constructor.name].join()
}

ATransform.prototype.error = function (x) {
  if (this.log) this.log.error(x)
  debug(x)
}

ATransform.prototype.info = function (x) {
  if (this.log) this.log.info(x)
  debug(x)
}

// Stream feeds
util.inherits(FeedStream, ATransform)
function FeedStream (opts) {
  if (!(this instanceof FeedStream)) return new FeedStream(opts)
  ATransform.call(this, opts)
  this.pushFeeds = true
  this.pushEntries = false
}

FeedStream.prototype.retrieve = function (tuple, cb) {
  var me = this
    , db = me.db
    , key = keys.key(keys.FED, tuple)

  db.get(keys.key(keys.FED, tuple), function (er, val) {
    if (er) {
      me.error(er)
    } else if (val) {
      var str = me.prepend(val)
      me.push(str)
    }
    cb()
  })
}

// Stream entries
util.inherits(EntryStream, ATransform)
function EntryStream (opts) {
  if (!(this instanceof EntryStream)) return new EntryStream(opts)
  ATransform.call(this, opts)
}

EntryStream.prototype.retrieve = function (tuple, cb) {
  var me = this
    , start = keys.key(keys.ENT, tuple)
    , end = keys.key(keys.ENT, [tuple[0], Date.now()])
    , stream = me.db.createValueStream({start:start, end:end})

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

// Transfrom stream values to tuples
util.inherits(URLStream, stream.Transform)
function URLStream (opts) {
  if (!(this instanceof URLStream)) return new URLStream(db)
  stream.Transform.call(this)
  this._writableState.objectMode = false
  this._readableState.objectMode = true
  this.log = opts.log
  this.db = opts.db
}

URLStream.prototype._transform = function (chunk, enc, cb) {
  var str = decode(chunk)
  try {
    var tuple = [JSON.parse(str).feed]
    this.push(tuple)
  } catch (er) {
    this.error(er)
  }
  cb()
}

URLStream.prototype.error = function (x) {
  if (this.log) this.log.error(x)
}

URLStream.prototype.info = function (x) {
  if (this.log) this.log.info(x)
}

// Boring housekeeping for update streams
function handleUpdate (log, reader, urls, writer) {
  function error (x) {
    if (log) log.error(x)
    debug(x)
  }
  function onReaderEnd () {
    reader.removeListener('error', error)
    reader.removeListener('end', onReaderEnd)
  }
  function onUrlsFinish() {
    reader.unpipe()
    urls.removeListener('error', error)
    urls.removeListener('finish', onUrlsFinish)
  }
  function onWriterFinish () {
    urls.unpipe()
    writer.removeListener('error', error)
    writer.removeListener('finish', onWriterFinish)
  }
  reader.on('error', error)
  reader.on('end', onReaderEnd)
  urls.on('error', error)
  urls.on('finish', onUrlsFinish)
  writer.on('error', error)
  writer.on('finish', onWriterFinish)
}

// TODO: Fix
// Update all feeds (including entries) in store
// - opts opts()
function update (opts) {
  opts.mode = 1
  var db = opts.db
    , log = opts.log
    , reader = db.createValueStream({ start:keys.FED })
    , urls = new URLStream(opts)
    , writer = new FeedStream(opts)
//  handleUpdate(log, reader, urls, writer)
  reader.pipe(urls).pipe(writer)
  return writer
}

// Dictionary of request streams currently in-flight
var _flights
function flights () {
  if (!_flights) _flights = Object.create(null)
  return _flights
}

// - uid ATransform.prototype.uid()
function inFlight (uid) {
  return flights()[uid]
}

function fly (uid, stream) {
  flights()[uid] = stream
}

function land (uid, etag) {
  flights()[uid] = null
}

// Put entry into store.
// - db The database instance
// - uri The uri of the feed
// - entry The entry object
// - cb(er, key)
function putEntry (db, uri, entry, cb) {
  var key = keys.key(keys.ENT, [uri, Date.parse(entry.updated)])
  entry.feed = uri
  db.put(key, JSON.stringify(entry), function (er) {
    cb(er, key)
  })
}

// Get stored entry.
// - db levelup()
// - tuple tuple()
// - cb cb(er, val)
function getEntry(db, tuple, cb) {
  db.get(keys.key(keys.ENT, tuple), cb)
}

// Put feed into store
// - db levelup()
// - uri http://some.where/feed.xml
// - cb cb(er, key)
function putFeed(db, uri, feed, cb) {
  var key = keys.key(keys.FED, [uri])
  feed.feed = uri
  db.put(key, JSON.stringify(feed), function (er) {
    cb(er, key)
  })
}

// Get stored feed.
// - db levelup()
// - uri http://example.org/feed.xml
// - cb cb(er, val)
function getFeed (db, uri, cb) {
  db.get(keys.key(keys.FED, [uri]), cb)
}

function putETag(db, uri, etag, cb) {
  db.put(keys.key(keys.ETG, [uri]), etag, cb)
}

// Get stored ETag for uri.
// - db levelup()
// - uri http://example.org/feed.xml
// - cb cb(er, val)
function getETag (db, uri, cb) {
  db.get(keys.key(keys.ETG, [uri]), cb)
}

// Release streams
// - streams Array of stream objects
function release (streams) {
  streams.forEach(function (stream) {
    stream.unpipe()
    stream.removeAllListeners()
  })
}

// Decode utf8 binary to string
// - buf utf8 encoded binary
var decoder = new string_decoder.StringDecoder()
function decode (buf) {
  return decoder.write(buf)
}

// true if value is stale and should be updated
// - val The value to check
// - mode The mode of the manger stream (1 | 2)
function stale (val, mode) {
  var cached = !!val
    , fresh  = mode === 1
    , cache  = mode === 2
  return (!cached || fresh) && !cache
}

function date (entry) {
  return entry.updated ? new Date(entry.updated) : new Date()
}

// True if time is newer than the time in tuple.
// - time Date.UTC()
// - tuple tuple()
function newer (time, tuple) {
  return time > tuple[1]
}
