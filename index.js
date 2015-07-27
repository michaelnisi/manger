// manger - cache feeds

exports = module.exports = function (name, opts) {
  return new Manger(name, opts)
}

var assert = require('assert')
var bytewise = require('bytewise')
var events = require('events')
var headary = require('headary')
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

exports.Entries = Entries
exports.Feeds = Feeds
exports.Manger = Manger
exports.MangerTransform = MangerTransform

exports.query = query
exports.queries = function (opts) {
  return new query.Queries(opts)
}

function nop () {}

var debug = function (o) {
  console.error('** manger: %s', util.inspect(o))
}
if (parseInt(process.env.NODE_DEBUG, 10) !== 1) debug = nop

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

function defaults (opts) {
  return new Opts(opts)
}

function extend (origin, add) {
  return util._extend(origin, add)
}

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
  this.decoder = new string_decoder.StringDecoder()
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
  var error
  var req = mod.request(opts, function headcb (res) {
    function onend () {
      req.removeListener('error', onerror)
      res.removeListener('end', onend)
      cb(error, res)
      cb = null
      error = null
      me = null
    }
    res.on('end', onend)
    res.resume()
  })
  function onerror (er) {
    var key = failureKey('HEAD', qry.url)
    me.failures.set(key, er.message)
    error = new Error(er.message)
  }
  req.on('error', onerror)
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
  var req = mod.get(opts, function (res) {
    var h = headary(res)
    if (h.ok) {
      me.parse(qry, res, function (er) {
        cb(er)
        cb = null
        me = null
      })
    } else {
      if (h.message) {
        var er = new Error(h.message)
        var key = failureKey('GET', qry.url)
        me.failures.set(key, h.message)
        me.emit('error', er)
        cb()
        cb = null
        me = null
      } else {
        res.req.abort()
        if (h.url) {
          me.redirects.set(qry.url, h.url)
          var nq = qry.clone(h.url)
          if (h.permanent) {
            remove(me.db, qry.url, function (er) {
              if (er && !er.notFound) me.emit('error', er)
              me.request(nq, cb)
              nq = null
              cb = null
            })
          } else {
            me.request(nq, cb)
            nq = null
            me = null
            cb = null
          }
        } else if (h.permanent) {
          remove(me.db, qry.url, function (er) {
            if (er && !er.notFound) me.emit('error', er)
            cb()
            cb = null
            me = null
          })
        } else {
          me.retrieve(qry, cb)
          me = null
          qry = null
          cb = null
        }
      }
    }
  })
  req.once('error', function (er) {
    var key = failureKey('GET', qry.url)
    me.failures.set(key, er.message)
    var error = new Error('request error: ' + er.message)
    me.emit('error', error)
    cb()
    cb = null
    me = null
  })
}

function shouldRequestHead (qry) {
  return !!qry.etag && qry.etag !== 'NO_ETAG'
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
        me._request(qry, cb)
        me = null
        cb = null
        qry = null
        return
      }
      var h = headary(res)
      if (h.ok) {
        if (res.headers.etag === qry.etag) {
          cb()
          cb = null
        } else {
          me._request(qry, cb)
        }
        me = null
        qry = null
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
          me = null
          qry = null
        } else if (h.permanent) {
          remove(me.db, qry.url, function (er) {
            if (er && !er.notFound) me.emit('error', er)
            cb()
            cb = null
          })
          me = null
          qry = null
        } else {
          me = null
          qry = null
          cb()
          cb = null
        }
      }
    })
  } else {
    this._request(qry, cb)
    qry = null
    cb = null
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
    var db = this.db
    var me = this
    var uri = qry.url
    // The ETag index is truth, it defines if something is cached.
    getETag(db, uri, function (er, etag) {
      if (er && !er.notFound) {
        me.emit('error', er)
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
      cb = null
      db = null
      me = null
      qry = null
    })
  }
}

MangerTransform.prototype.uid = function (uri) {
  return [this.db.location, uri].join('~')
}

function Put (key, value) {
  this.key = key
  this.value = value
  this.type = 'put'
}

function ended (writer) {
  var state = writer._writableState
  return state.ended || state.ending || state.finished
}

MangerTransform.prototype.parse = function (qry, res, cb) {
  var me = this
  var parser = pickup({ eventMode: true })
  var uri = qry.url
  var ops = []
  var rest = []
  var ok = true
  var count = 0
  function done (er) {
    assert(++count === 1)
    me = null
    parser.removeListener('entry', onentry)
    parser.removeListener('feed', onfeed)
    parser = null
    uri = null
    ops = null
    rest = null
    qry = null
    res = null
    cb(er)
    cb = null
  }
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
  function drive (reader, writer) {
    var ok = true
    function write () {
      if (ended(writer) || !ok) return
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
    function onend () {
      reader.removeListener('readable', write)
      reader.removeListener('end', onend)
      reader.removeListener('error', onerror)
      reader = null
      if (!ended(writer)) writer.end()
    }
    function onerror (er) {
      if (!me) return
      var error = new Error('parse error: ' + er.message)
      me.emit('error', error)
      var key = failureKey('GET', uri)
      me.failures.set(key, er.message)
      onend()
      done()
    }
    function onfinish () {
      if (writer) {
        writer.removeListener('error', onerror)
        writer.removeListener('finish', onfinish)
      }
      if (!me) return
      var isParser = writer === parser
      writer = null
      if (isParser) {
        dispose(function (er) {
          var tag = res.headers['etag'] || 'NO_ETAG'
          var key = schema.etag(uri)
          var op = new Put(key, tag)
          ops.push(op)
          me.db.batch(ops, function (er) {
            if (er) me.emit('error', er)
            done()
          })
        })
      }
    }
    reader.on('readable', write)
    reader.on('end', onend)
    reader.on('error', onerror)
    writer.on('error', onerror)
    writer.on('finish', onfinish)
  }
  parser.on('entry', onentry)
  parser.once('feed', onfeed)

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

// Requests updates for all feeds in ranked order (hot feeds first)
// and returns a readable stream of URLs of the updated feeds. Note
// that `flushCounter` has to be applied first, before update has any
// effect.
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
    if (!ok || !s) return
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
  has(db, uri, function (er) {
    if (er) return cb(er)
    var ops = [
      new Delete(schema.etag(uri)),
      new Delete(schema.feed(uri))
    ]
    var opts = schema.entries(uri, Infinity)
    var keys = db.createKeyStream(opts)
    keys.on('error', function (er) {
      keys.removeAllListeners()
      cb(er)
    })
    keys.on('data', function (chunk) {
      ops.push(new Delete(chunk))
    })
    keys.on('end', function () {
      keys.removeAllListeners()
      db.batch(ops, function (er) {
        cb(er)
      })
    })
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

  this.opts.failures = lru({ max: 500, maxAge: 36e5 * 24 })
  this.opts.redirects = lru({ max: 500, maxAge: 36e5 * 24 })
  this.counter = lru({ max: this.opts.counterMax })
  this.db = levelup(name, {
    keyEncoding: bytewise,
    cacheSize: this.opts.cacheSize
  })
}
util.inherits(Manger, events.EventEmitter)

function Delete (key) {
  this.key = key
  this.type = 'del'
}

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
  var ops = []
  var keys = db.createKeyStream(schema.allRanks)
  function read () {
    var key
    while ((key = keys.read()) !== null) {
      var op = new Delete(key)
      ops.push(op)
    }
  }
  function onend (er) {
    keys.removeListener('end', onend)
    keys.removeListener('readable', read)
    keys.removeListener('error', onerror)
    keys = null
    if (ops.length) {
      db.batch(ops, function (er) {
        if (error) {
          var error = new Error(er.message)
          cb(error)
        } else {
          cb()
          cb = null
        }
      })
      ops = null
    } else {
      cb(er)
      cb = null
    }
  }
  function onerror (er) {
    var error = new Error(er.message)
    onend(error)
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
  exports.Manger = Manger
  exports.URLs = URLs
  exports.debug = debug
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
