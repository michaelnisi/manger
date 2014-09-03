
// manger - cache feeds

exports = module.exports = function (opts) {
  return new Manger(opts)
}

var assert = require('assert')
  , gridlock = require('gridlock')
  , http = require('http')
  , key = require('./lib/key')
  , pickup = require('pickup')
  , query = require('./lib/query')
  , stream = require('stream')
  , string_decoder = require('string_decoder')
  , url = require('url')
  , util = require('util')
  , zlib = require('zlib')
  ;

var Query = exports.Query = query.Query

function noop () {}

var debug = function () {
  return process.env.NODE_DEBUG ?
    function (o) {
      console.error('**manger: %s', util.inspect(o))
    } : noop
}()

function defaults (opts) {
  opts = opts || Object.create(null)
  if (!opts.db) throw new Error('no database')
  opts.ignore = opts.ignore || false
  opts.pushEntries = opts.pushEntries || true
  opts.pushFeeds = opts.pushFeeds || false
  opts.readableObjectMode = opts.readableObjectMode || false
  opts.ok = true
  return opts
}

util.inherits(MangerTransform, stream.Transform)
function MangerTransform (opts, locker) {
  if (!(this instanceof MangerTransform)) return new MangerTransform(opts)
  opts = opts.ok ? opts : defaults(opts)
  stream.Transform.call(this, opts)
  util._extend(this, opts)
  this._readableState.objectMode = this.readableObjectMode
  this._writableState.objectMode = true
  this.locker = locker || { lock:noop, unlock:noop }
  this.state = 0
}

MangerTransform.prototype._flush = function (cb) {
  if (!this._readableState.objectMode) {
    var chunk = this.state === 0 ? '[]' : ']'
    this.push(chunk)
  }
  cb()
}

var CHARS = ['[', ',']
MangerTransform.prototype.use = function (chunk) {
  var it
  var obj = typeof chunk === 'object'
  if (this._readableState.objectMode) {
    it = obj ? chunk : JSON.parse(chunk)
  } else {
    it = CHARS[this.state] + (obj ? JSON.stringify(chunk) : chunk)
    if (this.state === 0) this.state = 1
  }
  return this.push(it)
}

MangerTransform.prototype.request = function (query, cb) {
  var me = this
  var lock = query.url
  function unlock () {
    me.locker.unlock(lock)
  }
  if (this.locker.lock(lock)) {
    me.locker.once(lock, function () {
      me.retrieve(query, cb)
    })
    return
  }
  var req = http.get(query.request(), function (res) {
    me.parse(query, res, function (er) {
      unlock()
      cb(er)
    })
  })
  req.once('error', function (er) {
    me.emit('error', er)
    cb() // carry on
  })
}

function stored (er, thing) {
  return !er && !!thing
}

MangerTransform.prototype._transform = function (query, enc, cb) {
  if (typeof query === 'string') query = new Query(query)
  if (!query.url) {
    cb(new Error('no url'))
  } else {
    var me = this
    getETag(this.db, query, function (er, etag) {
      if (me.ignore || !stored(er, etag)) {
        query.etag = etag
        me.request(query, cb)
      } else {
        me.retrieve(query, cb)
      }
    })
  }
}

MangerTransform.prototype.uid = function (uri) {
  return [this.db.location, uri].join('~')
}


function etag (res) {
  var h = res.headers
  return h.etag || h.Etag || h.ETag || h.ETAG
    || h['etag'] || h['Etag'] || h['ETag'] || h['ETAG'] || 0
}

MangerTransform.prototype.parse = function (query, res, cb) {
  var me = this
  var parser = pickup()
  var count = 0
  function done (er) {
    assert(count === 0) // Obey me!
    if (er) me.emit('error', er)
    parser.removeAllListeners()
    cb()
  }
  function onError (er) {
    count = 0
    done(er)
  }
  var uri = query.url
  var finished = false
  function onFeed (feed) {
    count++
    feed.feed = uri
    feed.updated = time(feed)
    putFeed(me.db, uri, feed, function (er) {
      if (er) me.emit(er)
      count--
      if (me.pushFeeds && newer(feed, query)) {
        if (!me.use(feed)) {
          me.emit(new Error('buffer overflow'))
        }
      }
      if (finished && count === 0) done()
    })
  }
  function onEntry (entry) {
    count++
    entry.feed = uri
    entry.updated = time(entry)
    putEntry(me.db, uri, entry, function (er) {
      if (er) me.emit(er)
      count--
      if (me.pushEntries && newer(entry, query)) {
        if (!me.use(entry)) {
          me.emit(new Error('buffer overflow'))
        }
      }
      if (finished && count === 0) done()
    })
  }
  function onFinish () {
    function end (er) {
      if (count === 0) done(er)
      finished = true
    }
    var tag = etag(res)
    var oldTag = query.etag
    if (tag === 0 && parseInt(oldTag) !== 0) {
      end()
    } else {
      putETag(me.db, uri, tag, function (er) {
        if (tag === 0) me.emit(new Error('no etag for ' + uri))
        end(er)
      })
    }
  }
  parser.on('entry', onEntry)
  parser.once('error', onError)
  parser.once('feed', onFeed)
  parser.once('finish', onFinish)

  function stream () {
    var unzip
    if (res.headers['content-encoding'] === 'gzip') {
      unzip = zlib.createGunzip()
      unzip.once('error', onError)
    }
    return !!unzip ? res.pipe(unzip).pipe(parser) : res.pipe(parser)
  }

  stream().resume()
}

// A stream of feeds.
util.inherits(Feeds, MangerTransform)
function Feeds (opts, locker) {
  if (!(this instanceof Feeds)) return new Feeds(opts, locker)
  MangerTransform.call(this, opts, locker)
  this.pushFeeds = true
  this.pushEntries = false
}

Feeds.prototype.retrieve = function (query, cb) {
  var me = this
  var db = me.db
  db.get(key(key.FED, query), function (er, val) {
    if (er) {
      if (er.notFound) {
        me.request(query, cb)
      } else {
        cb(er)
      }
    } else if (val) {
      if (!me.use(val)) {
        me.emit(new Error('buffer overflow'))
      }
      cb()
    }
  })
}

// A stream of entries.
util.inherits(Entries, MangerTransform)
function Entries (opts, locker) {
  if (!(this instanceof Entries)) return new Entries(opts, locker)
  MangerTransform.call(this, opts, locker)
}

Entries.prototype.retrieve = function (q, cb) {
  var me = this
  var stream = me.db.createValueStream({
    gte: key(key.ENT, q)
  , lte: key(key.ENT, new Query(q.url, Date.now()))
  })
  function push (value) {
    if (!me.use(value)) {
      me.emit(new Error('buffer overflow'))
    }
  }
  function done (er) {
    stream.removeAllListeners()
    cb(er)
  }
  stream.on('data', push)
  stream.once('end', done)
  stream.once('error', done)
}

// Transform feed keys to URLs.
util.inherits(URLs, stream.Transform)
function URLs (opts) {
  if (!(this instanceof URLs)) return new URLs(opts)
  opts = opts.ok ? opts : defaults(opts)
  opts = util._extend({ encoding:'utf8' }, opts)
  stream.Transform.call(this, opts)
  this._readableState.objectMode = opts.readableObjectMode
  this._decoder = new string_decoder.StringDecoder()
}

URLs.prototype._transform = function (chunk, enc, cb) {
  var url = this._decoder.write(chunk).split(key.FED + key.DIV)[1]
  this.push(url)
  cb()
}

// A readable stream of all subscribed feeds in the store.
function FeedURLs (opts) {
  var read = opts.db.createKeyStream(key.ALL_FEEDS)
  var write = new URLs(opts)
  return read.pipe(write)
}

function update (opts, locker) {
  var urls = new FeedURLs(opts)
  var copy = util._extend(Object.create(null), opts)
  copy.ignore = true
  var feeds = new Feeds(copy, locker)
  return urls.pipe(feeds)
}

// Put entry into store.
// - db The database instance
// - uri The uri of the feed
// - entry The entry object
// - cb(er, key)
function putEntry (db, uri, entry, cb) {
  var k = key(key.ENT, new Query(uri, entry.updated))
  entry.feed = uri
  db.put(k, JSON.stringify(entry), function (er) {
    cb(er, k)
  })
}

// Get stored entry.
// - db levelup()
// - query query()
// - cb cb(er, val)
function getEntry(db, query, cb) {
  db.get(key(key.ENT, query), cb)
}

// Put feed into store
// - db levelup()
// - uri String()
// - cb cb(er, key)
function putFeed(db, uri, feed, cb) {
  var k = key(key.FED, new Query(uri))
  feed.feed = uri
  var data = JSON.stringify(feed)
  db.put(k, data, function (er) {
    cb(er, k)
  })
}

// Get stored feed.
// - db levelup()
// - uri http://example.org/feed.xml
// - cb cb(er, val)
function getFeed (db, uri, cb) {
  db.get(key(key.FED, new Query(uri)), cb)
}

function putETag(db, uri, etag, cb) {
  db.put(key(key.ETG, new Query(uri)), etag, cb)
}

// Get stored ETag for uri.
// - db levelup()
// - query query()
// - cb cb(er, val)
function getETag (db, query, cb) {
  db.get(key(key.ETG, query), cb)
}

// Normalize dates of feeds or entries.
// - thing feed() | entry()
function time (thing) {
  return query.time(thing.updated)
}

function newer (item, query) {
  return item.updated >= query.since
}

function Manger (opts) {
  if (!(this instanceof Manger)) return new Manger(opts)
  opts = defaults(opts)
  this.opts = opts
  this.opts.ok = true
  this.locker = gridlock()
}

Manger.prototype.feeds = function () {
  return new Feeds(this.opts, this.locker)
}

Manger.prototype.entries = function () {
  return new Entries(this.opts, this.locker)
}

Manger.prototype.update = function () {
  return update(this.opts, this.locker)
}

Manger.prototype.list = function () {
  return new FeedURLs(this.opts)
}

if (process.env.NODE_TEST) {
  exports.Entries = Entries
  exports.FeedURLs = FeedURLs
  exports.Feeds = Feeds
  exports.Manger = Manger
  exports.etag = etag
  exports.getETag = getETag
  exports.getEntry = getEntry
  exports.getFeed = getFeed
  exports.newer = newer
  exports.putETag = putETag
  exports.putEntry = putEntry
  exports.putFeed = putFeed
  exports.update = update
}
