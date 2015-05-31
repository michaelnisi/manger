// manger - cache feeds

exports = module.exports = function (name, opts) {
  return new Manger(name, opts)
}

var assert = require('assert')
var bytewise = require('bytewise')
var events = require('events')
var http = require('http')
var https = require('https')
var levelup = require('levelup')
var lru = require('lru-cache')
var pickup = require('pickup')
var query = require('./lib/query')
var rank = require('./lib/rank')
var schema = require('./lib/schema')
var stream = require('readable-stream')
var string_decoder = require('string_decoder')
var util = require('util')
var zlib = require('zlib')

exports.query = query
exports.queries = function (opts) {
  return new query.Queries(opts)
}

function nop () {}

var debug = (function () {
  return parseInt(process.env.NODE_DEBUG, 10) === 1 ?
    function (o) {
      console.error('** manger: %s', util.inspect(o))
    } : nop
}())

function Opts (opts) {
  opts = opts || Object.create(null)
  this.counterMax = opts.counterMax || 500
  this.failures = opts.failures || { set: nop, get: nop, has: nop }
  this.force = opts.force || false
  this.highWaterMark = opts.highWaterMark
  this.readableObjectMode = opts.readableObjectMode || false
  this.redirects = opts.redirects || { set: nop, get: nop, has: nop }
}

function defaults (opts) {
  return new Opts(opts)
}

function extend (origin, add) {
  return util._extend(origin, add)
}

util.inherits(MangerTransform, stream.Transform)
function MangerTransform (db, opts) {
  if (!(this instanceof MangerTransform)) {
    return new MangerTransform(db, opts)
  }
  opts = defaults(opts)

  var sopts = Object.create(null)
  sopts.highWaterMark = opts.highWaterMark
  stream.Transform.call(this, db, sopts)

  this.counterMax = opts.counterMax
  this.failures = opts.failures
  this.force = opts.force
  this.redirects = opts.redirects

  this._readableState.objectMode = opts.readableObjectMode
  this._writableState.objectMode = true
  this.db = db
  this.decoder = new string_decoder.StringDecoder()
  this.state = 0
}

MangerTransform.prototype._flush = function (cb) {
  if (!this._readableState.objectMode) {
    var chunk = this.state === 0 ? '[]' : ']'
    this.push(chunk)
  }
  cb()
}

// The data we try to parse comes from within our own system, should
// it be corrupt and thus JSON failing to parse it, we better crash.
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

function sameEtag (qry, res) {
  var a = qry.etag
  var b = res.headers['etag']
  return !!a && !!b && a === b
}

function redirect (sc) {
  return sc >= 300 && sc < 400
}

// Set `ok` to `true` to signal that further action might be required.
// For a `not modified`, for example, `ok` should be `false`.
// To gradually tighten this up, unhandled HTTP status codes are
// considered errors.
function Headers (er, ok, url) {
  this.er = er
  this.ok = ok
  this.url = url
}

function processHeaders (qry, res) {
  var er
  var statusCode = res.statusCode
  if (statusCode === 304 || sameEtag(qry, res)) {
    return new Headers(er, false)
  } else if (redirect(statusCode)) {
    var url = res.headers['location']
    if (!!url && typeof url === 'string' && url !== qry.url) {
      return new Headers(er, false, url)
    }
  } else if (statusCode === 200) {
    return new Headers(er, true)
  } else {
    er = new Error(
      'ignored HTTP status: ' + statusCode + ' from ' + qry.url)
  }
  return new Headers(er, false)
}

var protocols = { 'http:': http, 'https:': https }

MangerTransform.prototype.head = function (qry, cb) {
  var opts = qry.request('HEAD')
  var mod = protocols[opts.protocol]
  var req = mod.request(opts, function (res) {
    res.req.abort() // TODO: Validate
    cb(null, res)
    cb = nop
  })
  var failures = this.failures
  req.once('error', function (er) {
    var key = failureKey('HEAD', qry.url)
    failures.set(key, er.message)
    er.query = qry
    cb(er)
  })
  req.end()
}

// A String to use as key for caching failed requests. The `method` is
// necessary to differentiate between `GET` and `HEAD` requests.
function failureKey (method, uri) {
  assert(typeof method === 'string', 'expected string')
  assert(typeof uri === 'string', 'expected string')
  return method + '-' + uri
}

MangerTransform.prototype._request = function (qry, cb) {
  var me = this
  var opts = qry.request()
  var mod = protocols[opts.protocol]
  var req = mod.get(opts, function (res) {
    var h = processHeaders(qry, res)
    var shouldAbort = !h.ok
    if (h.er) {
      var key = failureKey('GET', qry.url)
      me.failures.set(key, h.er.message)
      me.emit('error', h.er)
      cb()
    } else if (shouldAbort) {
      res.req.abort()
      var shouldRedirect = !!h.url
      if (shouldRedirect) {
        var er = new Error('redirecting')
        me.emit('error', er)
        this.redirects.set(qry.url, h.url)
        qry.url = h.url
        me.request(qry, cb)
      } else {
        me.retrieve(qry, cb)
      }
    } else {
      me.parse(qry, res, function (er) {
        cb(er)
      })
    }
  })
  req.once('error', function (er) {
    var key = failureKey('GET', qry.url)
    me.failures.set(key, er.message)
    me.emit('error', er)
    cb()
  })
}

var NO_ETAG = 'NO_ETAG'

function shouldRequestHead (qry) {
  return !!qry.etag && qry.etag !== NO_ETAG
}

MangerTransform.prototype.ignore = function (method, uri) {
  var key = failureKey(method, uri)
  return this.failures.has(key)
}

MangerTransform.prototype.request = function (qry, cb) {
  if (this.ignore('GET', qry.url)) {
    cb()
  } else if (shouldRequestHead(qry)) {
    if (this.ignore('HEAD', qry.url)) {
      return cb()
    }
    var me = this
    this.head(qry, function (er, res) {
      if (er) {
        me.emit('error', er)
        return me._request(qry, cb)
      }
      var h = processHeaders(qry, res)
      var shouldAbort = !h.ok
      if (h.er) {
        me.emit('error', h.er)
        me._request(qry, cb)
      } else if (shouldAbort) {
        var shouldRedirect = !!h.url
        if (shouldRedirect) {
          qry.url = h.url
          me.request(qry, cb)
        } else {
          // not our problem anymore
          cb()
        }
      } else {
        me._request(qry, cb)
      }
    })
  } else {
    this._request(qry, cb)
  }
}

function processQuery (me, qry) {
  if (qry instanceof Buffer) qry = me.decoder.write(qry)
  if (typeof qry === 'string') qry = query(qry)
  if (qry) {
    if (me.force) qry.force = true
    qry.url = me.redirects.get(qry.url) || qry.url
  }
  return qry
}

MangerTransform.prototype._transform = function (qry, enc, cb) {
  qry = processQuery(this, qry)
  if (!qry) {
    cb(new Error('invalid query'))
  } else {
    this.emit('qry', qry)
    var db = this.db
    var me = this
    var uri = qry.url
    // ETag defines if something is cached.
    getETag(db, uri, function (er, etag) {
      if (er && !er.notFound) {
        me.emit('error', er)
      }
      qry.etag = etag
      if (!qry.force && qry.etag) {
        me.retrieve(qry, cb)
      } else {
        me.request(qry, cb)
      }
    })
  }
}

MangerTransform.prototype.uid = function (uri) {
  return [this.db.location, uri].join('~')
}

var PICKUP_OPTS = { eventMode: true }

function Put (key, value) {
  this.key = key
  this.value = value
  this.type = 'put'
}

MangerTransform.prototype.parse = function (qry, res, cb) {
  var me = this
  var parser = pickup(PICKUP_OPTS)
  var uri = qry.url
  var ops = []
  var rest = []
  var ok = true
  function onfeed (feed) {
    feed.feed = uri
    feed.updated = time(feed)
    var key = schema.feed(uri)
    var op = new Put(key, JSON.stringify(feed))
    ops.push(op)
    if (!ok) {
      rest.push(feed)
    } else if (me.pushFeeds) {
      ok = me.use(feed)
    }
  }
  function onentry (entry) {
    entry.feed = uri
    entry.updated = time(entry)
    var key = schema.entry(uri, entry.updated)
    var op = new Put(key, JSON.stringify(entry))
    ops.push(op)
    if (!ok) {
      rest.push(entry)
    } else if (me.pushEntries && newer(entry, qry)) {
      ok = me.use(entry)
    }
  }
  function dispose (cb) {
    function write () {
      var it
      var ok = true
      while ((it = rest.shift())) {
        ok = me.use(it)
      }
      if (!ok) {
        me.once('drain', write)
      } else {
        cb()
      }
    }
    if (rest.length) {
      write()
    } else {
      cb()
    }
  }
  function onfinish () {
    dispose(function (er) {
      var tag = res.headers['etag'] || NO_ETAG
      var key = schema.etag(uri)
      var op = new Put(key, tag)
      ops.push(op)
      me.db.batch(ops, function (er) {
        if (er) me.emit('error', er)
        parser.removeAllListeners()
        cb()
      })
    })
  }
  parser.on('entry', onentry)
  parser.once('feed', onfeed)
  parser.once('finish', onfinish)

  var unzip
  if (res.headers['content-encoding'] === 'gzip') {
    unzip = zlib.createGunzip()
  }
  function drive (reader, writer) {
    var ok = true
    function write () {
      var state = writer._writableState
      var ended = state.ended || state.ending || state.finished
      if (ended || !ok) return
      var chunk
      while ((chunk = reader.read()) !== null) {
        ok = writer.write(chunk)
      }
      if (!ok) {
        writer.once('drain', function () {
          ok = true
          write()
        })
      }
    }
    function onerror (er) {
      me.emit('error', er)
      var key = failureKey('GET', uri)
      me.failures.set(key, er.message)
      reader.removeAllListeners()
      writer.removeAllListeners()
      writer.end()
      cb()
    }
    reader.on('readable', write)
    reader.once('error', onerror)
    reader.once('end', function () {
      reader.removeListener('readable', write)
      writer.end()
    })
    writer.once('error', onerror)
  }
  if (unzip) {
    drive(res, unzip)
    drive(unzip, parser)
  } else {
    drive(res, parser)
  }
}

util.inherits(OptGunzip, stream.Transform)
function OptGunzip (opts) {
  if (!(this instanceof OptGunzip)) return new OptGunzip(opts)
  stream.Transform.call(this, opts)
}

OptGunzip.prototype._transform = function (chunk, enc, cb) {
  this.push(chunk)
  cb()
}

// A stream of feeds.
util.inherits(Feeds, MangerTransform)
function Feeds (db, opts) {
  if (!(this instanceof Feeds)) return new Feeds(db, opts)
  MangerTransform.call(this, db, opts)
  this.pushFeeds = true
  this.pushEntries = false
}

Feeds.prototype.retrieve = function (qry, cb) {
  var me = this
  var db = this.db
  var uri = qry.url
  getFeed(db, uri, function (er, val) {
    if (er) {
      if (!er.notFound) {
        me.emit('error', er)
      }
    } else if (val) {
      me.use(val)
    }
    cb()
  })
}

// A stream of entries.
util.inherits(Entries, MangerTransform)
function Entries (db, opts) {
  if (!(this instanceof Entries)) return new Entries(db, opts)
  MangerTransform.call(this, db, opts)
  this.pushFeeds = false
  this.pushEntries = true
}

Entries.prototype.retrieve = function (qry, cb) {
  var me = this
  var values = this.db.createValueStream({
    gte: schema.entry(qry.url, qry.since),
    lte: schema.entry(qry.url, Date.now()),
    fillCache: true
  })
  function read () {
    var ok
    var yes
    do {
      var chunk
      yes = (chunk = values.read()) !== null
      if (yes) ok = me.use(chunk)
    } while (yes && ok)
    if (ok === false) me.once('drain', read)
  }
  values.on('readable', read)
  values.on('error', function (er) {
    me.emit('error', er)
  })
  values.on('end', function () {
    values.removeAllListeners()
    cb()
  })
}

// Transform feed keys to URLs.
util.inherits(URLs, stream.Transform)
function URLs (opts) {
  if (!(this instanceof URLs)) return new URLs(opts)
  stream.Transform.call(this, opts)
}

URLs.prototype._transform = function (chunk, enc, cb) {
  var key = bytewise.decode(chunk)
  var uri = key[1][1]
  this.push(uri)
  cb()
}

// A readable stream of all feed URLs represented as strings.
function list (db, opts) {
  var keys = db.createKeyStream(schema.allFeeds)
  var uris = new URLs({ encoding: 'utf8', objectMode: true })
  function write () {
    var yes
    var ok
    do {
      var chunk
      yes = (chunk = keys.read()) !== null
      if (yes) ok = uris.write(chunk)
    } while (yes && ok)
    if (ok === false) {
      keys.once('drain', write)
    }
  }
  keys.on('error', function (er) {
    uris.emit('error', er)
  })
  keys.on('end', function () {
    keys.removeAllListeners()
    uris.end()
  })
  keys.on('readable', write)
  return uris
}

// Requests updates for all feeds in ranked order (hot feeds first)
// and returns a readable stream of feeds that have been updated.
function update (db, opts) {
  var ranked = ranks(db, opts)
  var all = list(db, opts)

  var copy = extend(Object.create(null), opts)
  copy.force = true
  var feeds = new Feeds(db, copy)

  var merged = Object.create(null)
  var decoder = new string_decoder.StringDecoder()

  function merge (s) {
    s.on('error', function (er) {
      feeds.emit('error', er)
    })
    s.on('end', function () {
      s.removeAllListeners()
      if (s === all) {
        feeds.end()
      } else {
        merge(all)
      }
    })
    var ok = true
    function write () {
      if (!ok) return
      var chunk
      while ((chunk = s.read()) !== null) {
        var k = decoder.write(chunk)
        if (!(k in merged)) {
          ok = feeds.write(chunk)
          merged[k] = true
        }
      }
      if (!ok) {
        s.once('drain', function () {
          ok = true
          write()
        })
      }
    }
    s.on('readable', write)
  }
  merge(ranked)

  return feeds
}

function getFeed (db, uri, cb) {
  var key = schema.feed(uri)
  db.get(key, cb)
}

function getETag (db, uri, cb) {
  var key = schema.etag(uri)
  db.get(key, cb)
}

// Normalize dates of feeds or entries.
// - thing feed() | entry()
function time (thing) {
  return query.time(thing.updated)
}

function newer (item, qry) {
  var a = item.updated
  var b = qry.since
  return b === 0 || a > b
}

// Transforms rank keys to URLs.
util.inherits(Ranks, stream.Transform)
function Ranks (opts) {
  if (!(this instanceof Ranks)) return new Ranks(opts)
  stream.Transform.call(this, opts)
  this._readableState.objectMode = opts.readableObjectMode
}

Ranks.prototype._transform = function (chunk, enc, cb) {
  var uri = schema.URIFromRank(chunk)
  if (!this.push(uri)) {
    this.once('drain', cb)
  } else {
    cb()
  }
}

// API
util.inherits(Manger, events.EventEmitter)
function Manger (name, opts) {
  if (!(this instanceof Manger)) return new Manger(name, opts)
  events.EventEmitter.call(this)

  this.opts = defaults(opts)
  this.opts.failures = lru({ max: 500, maxAge: 36e5 * 24 })
  this.opts.redirects = lru({ max: 500, maxAge: 36e5 * 24 })
  this.counter = lru({ max: this.opts.counterMax })
  this.db = levelup(name, {
    keyEncoding: bytewise,
    cacheSize: this.opts.cacheSize
  })
}

Manger.prototype.flushCounter = function (cb) {
  var counter = this.counter
  rank(this.db, counter, function (er) {
    if (!er) counter.reset()
    if (cb) cb(er)
  })
}

function Delete (key) {
  this.key = key
  this.type = 'del'
}

function ranks (db, opts) {
  var keys = db.createKeyStream(schema.allRanks)
  var ranks = new Ranks(opts)
  keys.once('error', function (er) {
    keys.removeAllListeners()
    ranks.emit('error', er)
    ranks.end()
  })
  keys.once('end', function () {
    keys.removeAllListeners()
    ranks.end()
  })
  var ok = true
  function write () {
    if (!ok) return
    var chunk
    while ((chunk = keys.read()) !== null) {
      ok = ranks.write(chunk)
    }
    if (!ok) {
      ranks.once('drain', function () {
        ok = true
        write()
      })
    }
  }
  keys.on('readable', write)
  return ranks
}

// A readable stream of ranked URIs.
Manger.prototype.ranks = function () {
  return ranks(this.db, this.opts)
}

function resetRanks (db, cb) {
  cb = cb || nop
  var ops = []
  var keys = db.createKeyStream(schema.allRanks)
  function read () {
    var key
    while ((key = keys.read()) !== null) {
      var op = new Delete(key)
      ops.push(op)
    }
  }
  keys.on('readable', read)
  keys.once('end', function () {
    keys.removeAllListeners()
    if (ops.length) {
      db.batch(ops, cb)
    } else {
      cb()
    }
  })
  keys.once('error', function (er) {
    keys.removeAllListeners()
    keys.end()
    cb(er)
  })
}

Manger.prototype.resetRanks = function (cb) {
  return resetRanks(this.db, cb)
}

Manger.prototype.feeds = function () {
  return new Feeds(this.db, this.opts)
}

Manger.prototype.entries = function () {
  var s = new Entries(this.db, this.opts)
  var counter = this.counter
  function onqry (qry) {
    var k = qry.url
    var c = counter.peek(k) || 0
    counter.set(k, ++c)
  }
  s.on('qry', onqry)
  s.once('finish', function () {
    s.removeListener('qry', onqry)
  })
  return s
}

Manger.prototype.update = function () {
  return update(this.db, this.opts)
}

Manger.prototype.list = function () {
  return list(this.db, this.opts)
}

if (parseInt(process.env.NODE_TEST, 10) === 1) {
  exports.Entries = Entries
  exports.Feeds = Feeds
  exports.Headers = Headers
  exports.Manger = Manger
  exports.URLs = URLs
  exports.failureKey = failureKey
  exports.getETag = getETag
  exports.getFeed = getFeed
  exports.list = list
  exports.newer = newer
  exports.processHeaders = processHeaders
  exports.processQuery = processQuery
  exports.ranks = ranks
  exports.redirect = redirect
  exports.resetRanks = resetRanks
  exports.sameEtag = sameEtag
  exports.update = update
}
