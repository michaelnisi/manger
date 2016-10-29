'use strict'

// manger - cache feeds

exports = module.exports = function (name, opts) {
  return new Manger(name, opts)
}

const assert = require('assert')
const bytewise = require('bytewise')
const debug = require('util').debuglog('manger')
const events = require('events')
const headary = require('headary')
const http = require('http')
const https = require('https')
const levelup = require('levelup')
const lru = require('lru-cache')
const pickup = require('pickup')
const query = require('./lib/query')
const rank = require('./lib/rank')
const sanitize = require('sanitize-html')
const schema = require('./lib/schema')
const stream = require('readable-stream')
const stringDecoder = require('string_decoder')
const util = require('util')
const zlib = require('zlib')

exports.Entries = Entries
exports.Feeds = Feeds
exports.Manger = Manger
exports.MangerTransform = MangerTransform

exports.query = query
exports.queries = (opts) => {
  return new query.Queries(opts)
}

function nop () {}

function Opts (opts) {
  opts = opts || Object.create(null)
  this.cacheSize = opts.cacheSize || 8 * 1024 * 1024
  this.counterMax = opts.counterMax || 500
  this.failures = opts.failures || { set: nop, get: nop, has: nop }
  this.force = opts.force || false
  this.highWaterMark = opts.highWaterMark
  this.objectMode = opts.objectMode || false
  this.redirects = opts.redirects || { set: nop, get: nop, has: nop }
}

// A new copy of options with default properties if required.
function defaults (opts) {
  return new Opts(opts)
}

function extend (origin, add) {
  return util._extend(origin, add)
}

// Abstract base class for Feeds and Entries.
function MangerTransform (db, opts) {
  if (!(this instanceof MangerTransform)) {
    return new MangerTransform(db, opts)
  }

  opts = defaults(opts)

  stream.Transform.call(this, db, { highWaterMark: opts.highWaterMark })

  this.counterMax = opts.counterMax
  this.failures = opts.failures
  this.force = opts.force
  this.redirects = opts.redirects

  this._readableState.objectMode = opts.objectMode
  this._writableState.objectMode = true
  this.db = db
  this.decoder = new stringDecoder.StringDecoder()
  this.state = 0
}
util.inherits(MangerTransform, stream.Transform)

MangerTransform.prototype._flush = function (cb) {
  if (!this._readableState.objectMode) {
    var chunk = this.state === 0 ? '[]' : ']'
    this.push(chunk)
  }
  this.failures = null
  this.redirects = null
  this.db = null
  this.decoder = null
  cb()
}

// The data we try to parse comes from within our own system, should
// it be corrupt and thus JSON failing to parse it, we better crash.
MangerTransform.prototype.use = function (chunk) { // HOT
  var it
  var obj = typeof chunk === 'object'
  if (this._readableState.objectMode) {
    it = obj ? chunk : JSON.parse(chunk)
  } else {
    var chars = ['[', ',']
    it = chars[this.state] + (obj ? JSON.stringify(chunk) : chunk)
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

function protocol (name) {
  return { 'http:': http, 'https:': https }[name]
}

MangerTransform.prototype.head = function (qry, cb) {
  var opts = qry.request('HEAD')
  var mod = protocol([opts.protocol])
  var me = this

  var headResponse = function (res) {
    function next (er, res) {
      res.removeListener('error', responseError)
      res.removeListener('end', responseEnd)
      done(er, res)
    }
    function responseEnd () {
      next(null, res)
    }
    function responseError (er) {
      next(er)
    }
    res.once('end', responseEnd)
    res.once('error', responseError)

    res.resume() // to dismiss body
  }

  function done (er, res) {
    req.removeListener('error', requestError)
    req.removeListener('aborted', requestAborted)
    req = null

    headResponse = nop

    cb(er, res)
    cb = null
  }

  var req = mod.request(opts, headResponse)

  function requestError (er) {
    const key = failureKey('HEAD', qry.url)
    me.failures.set(key, er.message)
    done(er)
  }

  function requestAborted () {
    const er = new Error('aborted')
    done(er)
  }

  req.once('error', requestError)
  req.once('aborted', requestAborted)

  req.end()
}

// A String used to cache failed requests. The `method` is necessary to
// differentiate `GET` and `HEAD` requests.
function failureKey (method, uri) {
  assert(typeof method === 'string', 'expected string')
  assert(typeof uri === 'string', 'expected string')
  return method + '-' + uri
}

MangerTransform.prototype._request = function (qry, cb) {
  var opts = qry.request()
  var mod = protocol([opts.protocol])
  var me = this

  function done (er) {
    // The `notFound` property was set by levelup, marking this error irrelevant.
    if (er && !er.notFound) {
      er.url = qry.url
      me.emit('error', er)
    }

    req.removeListener('error', onRequestError)
    cb()

    me = req = cb = null
    onResponse = onParse = onRemove = onRemoveAfterRedirect = nop
  }

  var onParse = function (er) {
    done(er)
  }

  var onRemove = function (er) {
    done(er)
  }

  var onRemoveAfterRedirect // defined later, so we can cleanup its scope

  var onResponse = function (res) {
    var h = headary(res)
    if (h.ok) {
      return me.parse(qry, res, onParse)
    }

    res.resume() // to dismiss eventual data

    if (h.message) {
      var er = new Error(h.message)
      var key = failureKey('GET', qry.url)
      me.failures.set(key, h.message)
      done(er)
    } else {
      if (h.url) {
        me.redirects.set(qry.url, h.url)
        var nq = qry.clone(h.url)
        if (h.permanent) {
          onRemoveAfterRedirect = function (er) {
            if (er && !er.notFound) me.emit('error', er)
            req.removeListener('error', onRequestError)
            me.request(nq, cb)
            nq = me = req = cb = null
          }
          remove(me.db, qry.url, onRemoveAfterRedirect)
        } else {
          req.removeListener('error', onRequestError)
          me.request(nq, cb)
          nq = me = req = cb = null
        }
      } else if (h.permanent) {
        remove(me.db, qry.url, onRemove)
      } else {
        req.removeListener('error', onRequestError)
        me.retrieve(qry, cb)
        me = req = cb = null
      }
    }
  }

  function onRequestError (er) {
    // debug(er)
    req.abort()

    var key = failureKey('GET', qry.url)
    me.failures.set(key, er.message)

    const error = new Error(er.message)
    error.code = er.code
    error.url = qry.url

    onResponse = onParse = onRemove = onRemoveAfterRedirect = nop

    done(er)
  }

  var req = mod.get(opts, onResponse)
  debug('get: %j', opts)

  req.once('error', onRequestError)
}

function shouldRequestHead (qry) {
  return !!qry.etag && qry.etag !== 'NO_ETAG'
}

MangerTransform.prototype.ignore = function (method, uri) {
  var key = failureKey(method, uri)
  return this.failures.has(key)
}

MangerTransform.prototype.request = function (qry, cb) {
  // debug('req: %s', qry.url)
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
        me._request(qry, cb)
        me = cb = qry = null
        return
      }
      var h = headary(res)
      if (h.ok) {
        if (res.headers.etag === qry.etag) {
          cb()
        } else {
          me._request(qry, cb)
        }
        me = cb = qry = null
      } else {
        if (h.message) {
          er = new Error(h.message)
          me._request(qry, cb)
        } else if (h.url) {
          var nq = qry.clone(h.url)
          if (h.permanent) {
            remove(me.db, qry.url, function (er) {
              if (er && !er.notFound) me.emit('error', er)
              me.request(nq, cb)
            })
          } else {
            me.request(nq, cb)
          }
          me = qry = null
        } else if (h.permanent) {
          remove(me.db, qry.url, function (er) {
            if (er && !er.notFound) me.emit('error', er)
            cb()
            cb = null
          })
          me = qry = null
        } else {
          cb()
          me = qry = cb = null
        }
      }
    })
  } else {
    this._request(qry, cb)
    qry = cb = null
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
    this.emit('error', new Error('query error: invalid query'))
    return cb()
  }
  debug('_transform %s', qry.url)
  var me = this
  var uri = qry.url
  getETag(this.db, uri, function (er, etag) {
    if (er && !er.notFound) {
      return cb(er)
    }
    qry.etag = etag

    if (!qry.force && qry.etag) {
      // To make sure only valid feeds get counted, we emit 'query'
      // events for cached feeds only.
      me.emit('query', qry)
      me.retrieve(qry, cb)
    } else {
      me.request(qry, cb)
    }
  })
}

MangerTransform.prototype.uid = function (uri) {
  return [this.db.location, uri].join('~')
}

function charsetFromResponse (res) {
  if (!res) return null
  var a
  if (typeof res.getHeader === 'function') {
    a = res.getHeader('content-type')
  } else if (!res.headers) {
    return null
  } else {
    a = res.headers['content-type']
  }
  if (typeof a !== 'string') return null
  var b = a.split('charset')[1]
  if (typeof b !== 'string') return null
  var c = b.split('=')[1]
  if (typeof c !== 'string') return null
  return c.trim()
}

function PickupOpts (charset) {
  this.charset = charset
  this.eventMode = true
}

var allowedTags = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol', 'li',
  'b', 'i', 'strong', 'em', 'code', 'br', 'div', 'pre'
]

function html (str) {
  if (typeof str !== 'string') return null
  var s = sanitize(str, {
    allowedTags: allowedTags
  })
  return s
}

// Parses response body for feeds and entries, unzipping it if necessary and save
// the found feeds and entries to the database. When finished, the callback is
// is applied with an eventual error.
MangerTransform.prototype.parse = function (qry, res, cb) {
  const uri = qry.url

  // It still escapes me why http.IncomingMessage wouldn't provide the URL of its
  // originating request. Anyways, just pass the query to provide it.
  debug('parse %s', uri)

  const me = this

  const rest = []
  const batch = this.db.batch()

  var ok = true

  function onFeed (feed) {
    feed.feed = uri
    feed.updated = time(feed)
    var k = schema.feed(uri)
    var v = JSON.stringify(feed)
    batch.put(k, v)
    if (!ok) {
      rest.push(feed)
    } else if (me.pushFeeds) {
      ok = me.use(feed)
    }
  }

  function onEntry (entry) {
    entry.feed = uri
    entry.updated = time(entry)
    entry.summary = html(entry.summary)

    var k = schema.entry(uri, entry.updated)
    var v = JSON.stringify(entry)
    batch.put(k, v)
    if (!ok) {
      rest.push(entry)
    } else if (me.pushEntries && newer(entry, qry)) {
      ok = me.use(entry)
    }
  }

  const charset = charsetFromResponse(res)
  const opts = new PickupOpts(charset)
  const parser = pickup(opts)

  parser.on('entry', onEntry)
  parser.once('feed', onFeed)

  function done (er) {
    parser.removeListener('entry', onEntry)
    parser.removeListener('feed', onFeed)
    cb(er)
    qry = res = cb = null
  }

  // The callback parameter here is `done(er)`.
  function dispose (cb) {
    function write () {
      var it
      var ok = true
      while ((it = rest.shift())) {
        ok = me.use(it)
      }
      if (!ok) {
        debug('warning: high water mark exceeded')
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

  function drive (reader, writer) {
    var ok = true
    function onDrain () {
      ok = true
      write()
    }
    function write () {
      if (!ok) return
      var chunk
      while ((chunk = reader.read()) !== null) {
        ok = writer.write(chunk)
      }
      if (!ok) writer.once('drain', onDrain)
    }
    function onEnd () {
      reader.removeListener('end', onEnd)
      reader.removeListener('error', onError)
      reader.removeListener('readable', write)
      reader = null

      writer.removeListener('drain', onDrain)
      writer.end()
    }
    function onError (er) {
      var error = new Error('parse error: ' + er.message + ': parsing: ' + uri)
      me.emit('error', error)
      var key = failureKey('GET', uri)
      me.failures.set(key, er.message)
      onEnd()
    }
    function onFinish () {
      writer.removeListener('error', onError)
      writer.removeListener('finish', onFinish)
      var isParser = writer === parser
      writer = null

      if (isParser) {
        dispose(function (er) {
          var k = schema.etag(uri)
          var v = res.headers['etag'] || 'NO_ETAG'
          batch.put(k, v)
          batch.write(function (er) {
            if (er) me.emit('error', er)
            done()
          })
        })
      }
    }

    reader.on('readable', write)
    reader.on('end', onEnd)
    reader.on('error', onError)

    writer.on('error', onError)
    writer.on('finish', onFinish)
  }

  if (res.headers['content-encoding'] === 'gzip') {
    var unzip = zlib.createGunzip()
    drive(res, unzip)
    drive(unzip, parser)
  } else {
    drive(res, parser)
  }
}

// A stream of feeds.
function Feeds (db, opts) {
  if (!(this instanceof Feeds)) return new Feeds(db, opts)
  MangerTransform.call(this, db, opts)
  this.pushFeeds = true
  this.pushEntries = false
}
util.inherits(Feeds, MangerTransform)

Feeds.prototype.retrieve = function (qry, cb) {
  // debug('hit: %s', qry.url)
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
    me = null
    cb()
    cb = null
  })
}

// A stream of entries.
function Entries (db, opts) {
  if (!(this instanceof Entries)) return new Entries(db, opts)
  MangerTransform.call(this, db, opts)
  this.pushFeeds = false
  this.pushEntries = true
}
util.inherits(Entries, MangerTransform)

Entries.prototype.retrieve = function (qry, cb) {
  var me = this
  var opts = schema.entries(qry.url, qry.since, true)
  var values = this.db.createValueStream(opts)
  var ok = true
  function use () {
    if (!ok || !values) return
    var chunk
    while (ok && (chunk = values.read()) !== null) {
      ok = me.use(chunk)
    }
    if (!ok) {
      me.once('drain', function () {
        ok = true
        use()
      })
    }
  }
  function onend (er) {
    if (!values) return
    values.removeListener('readable', use)
    values.removeListener('error', onerror)
    values.removeListener('end', onend)
    values = null
    me = null
    cb(er)
    cb = null
  }
  function onerror (er) {
    var error = new Error('retrieve error: ' + er.message)
    onend(error)
  }
  values.on('readable', use)
  values.on('error', onerror)
  values.on('end', onend)
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

function list (db, opts) {
  var keys = db.createKeyStream(schema.allFeeds)
  var uris = new URLs({ objectMode: true })
  var ok = true
  function write () {
    if (!ok) return
    var chunk
    while ((chunk = keys.read()) !== null) {
      ok = uris.write(chunk)
    }
    if (!ok) {
      uris.once('drain', function () {
        ok = true
        write()
      })
    }
  }
  function onerror (er) {
    var error = new Error('list error: ' + er.message)
    uris.emit('error', error)
  }
  function onend () {
    keys.removeListener('end', onend)
    keys.removeListener('error', onerror)
    keys.removeListener('readable', write)
    keys = null
    uris.end()
    uris = null
  }
  keys.on('end', onend)
  keys.on('error', onerror)
  keys.on('readable', write)
  return uris
}

// Transform feeds to URLs.
function FeedURLs (opts) {
  if (!(this instanceof FeedURLs)) return new FeedURLs(opts)
  stream.Transform.call(this, opts)
}
util.inherits(FeedURLs, stream.Transform)

FeedURLs.prototype._transform = function (chunk, enc, cb) {
  var uri = chunk.feed
  if (uri) {
    this.push(uri)
  } else {
    this.emit('error', new Error('feed without URL'))
  }
  cb()
}

// TODO: Handle netsplit during update

// Updates all feeds in ranked order, hot feeds first, and returns a readable
// stream of updated feeds. Using ranks as input implies that `flushCounter`  has
// been run at least once before update has any effect.
function update (db, opts, x) {
  var fopts = cp(opts)
  fopts.force = true
  fopts.objectMode = true

  var s = new Feeds(db, fopts)
  var r = ranks(db, opts)

  var ok = true

  function ondrain () {
    ok = true
    write()
  }
  function write () {
    if (!ok) return
    var chunk
    while (ok && (chunk = r.read()) !== null) {
      ok = s.write(chunk)
    }
    if (!ok) {
      s.once('drain', ondrain)
    }
  }
  function onerror (er) {
    var error = new Error('update error: ' + er.message)
    s.emit('error', error)
  }
  function onend () {
    r.removeListener('end', onend)
    r.removeListener('error', onerror)
    r.removeListener('readable', write)
    r = null

    s.end()
    s.removeListener('drain', ondrain)
    s = null
  }
  r.on('end', onend)
  r.on('error', onerror)
  r.on('readable', write)

  return s
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

function has (db, uri, cb) {
  getETag(db, uri, function (er, etag) {
    cb(er)
  })
}

function remove (db, uri, cb) {
  has(db, uri, function hasHandler (er) {
    if (er) {
      cb(er)
      cb = null
      return
    }
    function done (er) {
      if (!cb) return
      keys.removeListener('data', ondata)
      keys.removeListener('end', onend)
      keys.removeListener('error', onerror)
      function error () {
        if (er) {
          return new Error('failed to remove: ' + er.message)
        }
      }
      cb(error())
      cb = null
    }
    var opts = schema.entries(uri, Infinity)
    var keys = db.createKeyStream(opts)
    var batch = db.batch()
    batch.del(schema.etag(uri))
    batch.del(schema.feed(uri))
    function onerror (er) {
      done(er)
    }
    function ondata (chunk) {
      batch.del(chunk)
    }
    function onend () {
      batch.write(function BatchWriteHandler (er) {
        done(er)
      })
    }
    keys.on('data', ondata)
    keys.on('end', onend)
    keys.on('error', onerror)
  })
}

function flushCounter (db, counter, cb) {
  cb = cb || nop
  rank(db, counter, function (er, count) {
    if (!er) counter.reset()
    cb(er, count)
    cb = null
  })
}

function cp (it) {
  var o = Object.create(null)
  it = it ? extend(o, it) : o
  return it
}

// Transforms rank keys to URLs.
function Ranks (opts) {
  if (!(this instanceof Ranks)) return new Ranks(opts)
  stream.Transform.call(this, opts)
  this._readableState.objectMode = opts.objectMode
}
util.inherits(Ranks, stream.Transform)

Ranks.prototype._transform = function (chunk, enc, cb) {
  var uri = schema.URIFromRank(chunk)
  if (!this.push(uri)) {
    this.once('drain', cb)
  } else {
    cb()
  }
}

function Manger (name, opts) {
  if (!(this instanceof Manger)) return new Manger(name, opts)
  events.EventEmitter.call(this)

  this.opts = defaults(opts)

  // TODO: Move failures and redirects out of opts

  this.opts.failures = lru({ max: 500, maxAge: 36e5 * 24 })
  this.opts.redirects = lru({ max: 500, maxAge: 36e5 * 24 })

  this.counter = lru({ max: this.opts.counterMax })

  var db = levelup(name, {
    keyEncoding: bytewise,
    cacheSize: this.opts.cacheSize
  })
  var me = this
  function dbGetter () {
    if (!db || db.isClosed()) {
      me.emit('error', new Error('no database'))
    } else {
      return db
    }
  }
  Object.defineProperty(this, 'db', { get: dbGetter })
}
util.inherits(Manger, events.EventEmitter)

function ranks (db, opts) {
  var keys = db.createKeyStream(schema.allRanks)
  var ranks = new Ranks(cp(opts))
  function onend () {
    ranks.end()
    ranks.removeListener('drain', write)
    ranks = null
    keys.removeListener('error', onerror)
    keys.removeListener('end', onend)
    keys = null
  }
  function onerror (er) {
    ranks.emit('error', er)
    onend()
  }
  var ok = true
  function write () {
    if (!ok || !ranks || !keys) return
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
  keys.on('end', onend)
  keys.on('readable', write)
  keys.once('error', onerror)
  return ranks
}

// A readable stream of ranked URIs.
Manger.prototype.ranks = function () {
  return ranks(this.db, this.opts)
}

function resetRanks (db, cb) {
  var batch = db.batch()
  var keys = db.createKeyStream(schema.allRanks)
  function done (er) {
    if (!cb) return
    batch = null
    keys.removeListener('end', onend)
    keys.removeListener('readable', read)
    keys.removeListener('error', onerror)
    keys = null
    function error () {
      if (er) {
        return new Error('failed to reset ranks: ' + er.message)
      }
    }
    cb(error())
    cb = null
  }
  function onend (er) {
    batch.write(function (er) {
      done(er)
    })
  }
  function onerror (er) {
    done(er)
  }
  function read () {
    var key
    while ((key = keys.read()) !== null) {
      batch.del(key)
    }
  }
  keys.on('end', onend)
  keys.on('readable', read)
  keys.once('error', onerror)
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
  function onquery (qry) {
    var k = qry.url
    var c = counter.peek(k) || 0
    counter.set(k, ++c)
  }
  function deinit () {
    if (!s) return
    s.removeListener('error', deinit)
    s.removeListener('finish', deinit)
    s.removeListener('query', onquery)
    s = null
    counter = null
  }
  s.on('error', deinit)
  s.on('finish', deinit)
  s.on('query', onquery)
  return s
}

Manger.prototype.flushCounter = function (cb) {
  return flushCounter(this.db, this.counter, cb)
}

// -x Number of concurrent streams to use
Manger.prototype.update = function (x) {
  return update(this.db, this.opts, x)
}

Manger.prototype.list = function () {
  return list(this.db, this.opts)
}

Manger.prototype.has = function (uri, cb) {
  return has(this.db, uri, cb)
}

Manger.prototype.remove = function (uri, cb) {
  return remove(this.db, uri, cb)
}

if (parseInt(process.env.NODE_TEST, 10) === 1) {
  exports.Entries = Entries
  exports.Feeds = Feeds
  exports.html = html
  exports.Manger = Manger
  exports.URLs = URLs
  exports.charsetFromResponse = charsetFromResponse
  exports.failureKey = failureKey
  exports.getETag = getETag
  exports.getFeed = getFeed
  exports.list = list
  exports.newer = newer
  exports.processQuery = processQuery
  exports.ranks = ranks
  exports.redirect = redirect
  exports.resetRanks = resetRanks
  exports.sameEtag = sameEtag
  exports.update = update
}
