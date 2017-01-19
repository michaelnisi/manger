'use strict'

// manger - cache feeds

exports = module.exports = Manger

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
const schema = require('./lib/schema')
const speculum = require('speculum')
const stream = require('readable-stream')
const stringDecoder = require('string_decoder')
const strings = require('./lib/strings')
const util = require('util')
const zlib = require('zlib')

exports.Entries = Entries
exports.Feeds = Feeds
exports.Opts = Opts
exports.Queries = query.Queries
exports.query = query

function nop () {}

function Opts (
  cacheSize = 16 * 1024 * 1024,
  counterMax = 500,
  failures = { set: nop, get: nop, has: nop },
  force = false,
  highWaterMark,
  isEntry = function (entry) { return true },
  isFeed = function (feed) { return true },
  objectMode = false,
  redirects = { set: nop, get: nop, has: nop }
) {
  this.cacheSize = cacheSize
  this.counterMax = counterMax
  this.failures = failures
  this.force = force
  this.highWaterMark = highWaterMark
  this.isEntry = isEntry
  this.isFeed = isFeed
  this.objectMode = objectMode
  this.redirects = redirects
}

function defaults (opts = Object.create(null)) {
  if (opts instanceof Opts) return opts
  return new Opts(
    opts.cacheSize,
    opts.counterMax,
    opts.failures,
    opts.force,
    opts.highWaterMark,
    opts.isEntry,
    opts.isFeed,
    opts.objectMode,
    opts.redirects
  )
}

// Abstract base class for Feeds and Entries.
function MangerTransform (db, opts) {
  if (!(this instanceof MangerTransform)) {
    return new MangerTransform(db, opts)
  }

  const o = defaults(opts)

  stream.Transform.call(this, db, { highWaterMark: o.highWaterMark })

  this.counterMax = o.counterMax
  this.failures = o.failures
  this.force = o.force
  this.isEntry = o.isEntry
  this.isFeed = o.isFeed
  this.redirects = o.redirects
  this._readableState.objectMode = o.objectMode

  this._writableState.objectMode = true
  this.db = db
  this.decoder = new stringDecoder.StringDecoder('utf8')
  this.state = 0
}
util.inherits(MangerTransform, stream.Transform)

MangerTransform.prototype._flush = function (cb) {
  if (!this._readableState.objectMode) {
    const chunk = this.state === 0 ? '[]' : ']'
    this.push(chunk)
  }
  this.failures = null
  this.redirects = null
  this.db = null
  this.decoder = null
  if (cb) cb()
}

// A central method to push data.
//
// Always go through here, never push directly!
//
// - chunk Buffer() | Object() The chunk to be written.
// - qry Query() The current query, passed to enable us to deal with redirects.
MangerTransform.prototype.use = function (chunk, qry) {
  const uri = qry.uri()
  const originalURL = qry.originalURL

  // The data, we’re trying to parse here, comes from within our own system,
  // should it be corrupt and thus JSON failing to parse it, we better crash.

  let it
  let obj = typeof chunk === 'object'
  if (this._readableState.objectMode) {
    it = obj ? chunk : JSON.parse(chunk)
    it.feed = uri
    it.originalURL = originalURL
  } else {
    if (originalURL) {
      if (!obj) {
        obj = true
        chunk = JSON.parse(chunk)
        chunk.feed = uri
        chunk.originalURL = originalURL
      }
    }
    const chars = ['[', ',']
    it = chars[this.state] + (obj ? JSON.stringify(chunk) : chunk)
    if (this.state === 0) this.state = 1
  }
  return this.push(it)
}

function sameEtag (qry, res) {
  const a = qry.etag
  const b = res.headers['etag']
  return !!a && !!b && a === b
}

function redirect (sc) {
  return sc >= 300 && sc < 400
}

MangerTransform.prototype.httpModule = function (name) {
  if (name === 'http:') return [null, http]
  if (name === 'https:') return [null, https]
  return [new Error('invalid protocol')]
}

MangerTransform.prototype.head = function (qry, cb) {
  debug('HEAD: %s', qry.url)

  const opts = qry.request('HEAD')

  const [er, mod] = this.httpModule(opts.protocol)
  if (er) { return cb ? cb(er) : null }

  function headResponse (res) {
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

    res.resume() // to dismiss eventual body
  }

  function done (er, res) {
    req.removeListener('aborted', requestAborted)
    req.removeListener('error', requestError)
    req.removeListener('response', headResponse)
    if (cb) cb(er, res)
  }

  let req = mod.request(opts, headResponse)

  let requestError = (er) => {
    const key = failureKey('HEAD', qry.url)
    this.failures.set(key, er.message)
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

// A redirect consisting of HTTP status code and new URL.
function Redirect (code, url) {
  this.code = code
  this.url = url
}

MangerTransform.prototype._request = function (qry, cb) {
  debug('GET: %s', qry.url)

  const opts = qry.request()

  const [er, mod] = this.httpModule(opts.protocol)
  if (er) {
    this.emit('error', er)
    return cb ? cb() : null
  }

  function removeListeners () {
    req.removeListener('error', onRequestError)
    req.removeListener('response', onResponse)
    onParse = onRemove = onRemoveAfterRedirect = null
  }

  const done = (er) => {
    // The `notFound` property was set by levelup, marking this error irrelevant.
    if (er && !er.notFound) {
      er.url = qry.url
      this.emit('error', er)
    }
    removeListeners()
    if (cb) cb()
  }

  let onParse = function (er) {
    done(er)
  }

  let onRemove = function (er) {
    done(er)
  }

  // TODO: Evaluate if this is necessary
  let onRemoveAfterRedirect // defined later, so we can cleanup its scope

  const onResponse = (res) => {
    const h = headary(res)

    if (h.ok) {
      return this.parse(qry, res, onParse)
    }

    res.resume() // to dismiss body

    if (h.message) {
      const er = new Error(h.message)
      const key = failureKey('GET', qry.url)
      this.failures.set(key, h.message)
      return done(er)
    }

    if (h.url) {
      debug('redirecting GET %s to %s', qry.url, h.url)

      const code = h.permanent ? 301 : 302
      const nq = qry.redirect(code, h.url)
      if (!nq) {
        return done(new Error('too many redirects'))
      }

      this.redirects.set(nq.originalURL, new Redirect(nq.code, nq.url))

      if (h.permanent) { // permanent redirect
        onRemoveAfterRedirect = (er) => {
          if (er && !er.notFound) this.emit('error', er)
          removeListeners()
          this.request(nq, cb)
        }
        return remove(this.db, qry.url, onRemoveAfterRedirect)
      } else { // temporary redirect
        removeListeners()
        return this.request(nq, cb)
      }
    }

    if (h.permanent) { // gone
      return remove(this.db, qry.url, onRemove)
    } else {
      removeListeners()
      return this.retrieve(qry, cb)
    }
  }

  const onRequestError = (er) => {
    debug(er)
    req.abort()

    const key = failureKey('GET', qry.url)
    this.failures.set(key, er.message)

    const error = new Error(er.message)
    error.code = er.code
    error.url = qry.url

    done(er)
  }

  let req = mod.get(opts, onResponse)

  req.once('error', onRequestError)
}

function shouldRequestHead (qry) {
  return !!qry.etag && qry.etag !== 'NO_ETAG'
}

MangerTransform.prototype.ignore = function (method, uri) {
  const key = failureKey(method, uri)
  const has = this.failures.has(key)
  if (has) debug('skipping: %s', uri)
  return has
}

const blacklist = RegExp([
  'ENOTFOUND'
  // TODO: Add more errors after which to abort after HEAD
].join('|'), 'i')

MangerTransform.prototype.request = function (qry, cb) {
  const done = (er) => {
    if (cb) cb(er)
  }

  if (this.ignore('GET', qry.url)) {
    return done()
  } else if (shouldRequestHead(qry)) {
    if (this.ignore('HEAD', qry.url)) {
      return done()
    }
    this.head(qry, (er, res) => {
      if (er) {
        this.emit('error', er)
        const msg = er.message
        if (msg.match(blacklist) !== null) {
          const uri = qry.url
          const key = failureKey('HEAD', uri)
          this.failures.set(key, er.message)
          return remove(this.db, uri, (er) => {
            if (er && !er.notFound) this.emit('error', er)
            done()
          })
        }
        return this._request(qry, cb)
      }

      const h = headary(res)

      if (h.ok) {
        if (res.headers.etag === qry.etag) {
          return done()
        } else {
          return this._request(qry, cb)
        }
      }

      if (h.message) {
        debug('falling back on GET after HEAD message: %s', h.message)

        // We cannot assume that the remote server is handling HEAD requests
        // correctly, therefor we hit it again with a GET to find out what’s
        // going on. Our GET handler will eventually emit the error.

        return this._request(qry, cb)
      }

      if (h.url) {
        debug('redirecting HEAD %s to %s', qry.url, h.url)

        const code = h.permanent ? 301 : 302
        const nq = qry.redirect(code, h.url)
        if (!nq) {
          return done(new Error('too many redirects'))
        }

        // It gets fuzzy here: Should we set a redirect?

        if (h.permanent) { // permanent redirect
          return remove(this.db, qry.url, (er) => {
            if (er && !er.notFound) this.emit('error', er)
            this.request(nq, cb)
          })
        } else { // temporary redirect
          return this.request(nq, cb)
        }
      }

      if (h.permanent) { // gone
        return remove(this.db, qry.url, (er) => {
          if (er && !er.notFound) this.emit('error', er)
          done()
        })
      } else {
        return done()
      }
    })
  } else {
    return this._request(qry, cb)
  }
}

function processQuery (me, qry) {
  if (!(qry instanceof query.Query)) {
    if (!qry) return
    if (qry instanceof Buffer) qry = me.decoder.write(qry)
    if (typeof qry === 'string') {
      qry = query(qry)
    } else { // plain objects are fine too
      qry = query(qry.url, qry.since, qry.etag, qry.force)
    }
  }
  if (qry) {
    if (me.force) qry.force = true
    const r = me.redirects.get(qry.url)
    if (r instanceof Redirect) {
      return qry.redirect(r.code, r.url)
    }
  }
  return qry
}

MangerTransform.prototype._transform = function (q, enc, cb) {
  const qry = processQuery(this, q)

  if (!qry) {
    this.emit('error', new Error('query error: invalid query'))
    return cb()
  }

  const uri = qry.uri()

  getETag(this.db, uri, (er, etag) => {
    if (er && !er.notFound) {
      return cb(er)
    }
    qry.etag = etag

    if (!qry.force && qry.etag) {
      this.emit('hit', qry)
      this.retrieve(qry, cb)
    } else {
      debug('miss: %s', qry.url)
      this.request(qry, cb)
    }
  })
}

MangerTransform.prototype.uid = function (uri) {
  return [this.db.location, uri].join('~')
}

function charsetFromResponse (res) {
  if (!res) return null
  let a
  if (typeof res.getHeader === 'function') {
    a = res.getHeader('content-type')
  } else if (!res.headers) {
    return null
  } else {
    a = res.headers['content-type']
  }
  if (typeof a !== 'string') return null
  const b = a.split('charset')[1]
  if (typeof b !== 'string') return null
  const c = b.split('=')[1]
  if (typeof c !== 'string') return null
  return c.trim()
}

function PickupOpts (charset) {
  this.charset = charset
  this.eventMode = true
}

// Parses response body for feeds and entries, unzipping it if necessary and save
// the found feeds and entries to the database. When finished, the callback is
// is applied with an eventual error.
MangerTransform.prototype.parse = function (qry, res, cb) {
  const uri = qry.uri()
  const originalURL = qry.originalURL

  const rest = []
  const batch = this.db.batch()

  let ok = true

  // TODO: Adjust original Feed and Entry classes in pickup
  //
  // ... to prevent V8 from adding hidden classes.
  // So, add url and originalURL properties in the pickup module.

  const onFeed = (feed) => {
    feed.url = uri
    feed.originalURL = originalURL

    feed.updated = Math.max(time(feed), 1)

    if (!this.isFeed(feed)) {
      debug('invalid feed: %s', feed)
      return
    }

    const k = schema.feed(uri)
    const v = JSON.stringify(feed)
    batch.put(k, v)
    if (!ok) {
      rest.push(feed)
    } else if (this.pushFeeds) {
      ok = this.use(feed, qry)
    }
  }

  const onEntry = (entry) => {
    entry.url = uri
    entry.originalURL = originalURL

    entry.updated = Math.max(time(entry), 1)
    entry.summary = strings.html(entry.summary)
    entry.duration = strings.duration(entry.duration)
    entry.id = strings.entryID(entry)

    if (typeof entry.id !== 'string' || !this.isEntry(entry)) {
      debug('invalid entry: %s', entry)
      return
    }

    const k = schema.entry(uri, entry.updated, entry.id)
    const v = JSON.stringify(entry)
    batch.put(k, v)
    if (!ok) {
      rest.push(entry)
    } else if (this.pushEntries && newer(entry, qry)) {
      ok = this.use(entry, qry)
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
    if (cb) cb(er)
  }

  // The callback parameter here is `done(er)`.
  const dispose = (cb) => {
    const write = () => {
      let it
      let ok = true
      while (ok && (it = rest.shift())) {
        ok = this.use(it, qry)
      }
      if (!ok) {
        debug('warning: high water mark exceeded')
        this.once('drain', write)
      } else {
        if (cb) cb()
      }
    }
    if (rest.length) {
      write()
    } else {
      if (cb) cb()
    }
  }

  const drive = (reader, writer) => {
    let ok = true
    function onDrain () {
      ok = true
      write()
    }
    function write () {
      if (!ok) return
      let chunk
      while (ok && (chunk = reader.read()) !== null) {
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
    const onError = (er) => {
      const error = new Error('parse error: ' + er.message + ': parsing: ' + uri)
      this.emit('error', error)
      const key = failureKey('GET', uri)
      this.failures.set(key, er.message)
      onEnd()
    }
    const onFinish = () => {
      writer.removeListener('error', onError)
      writer.removeListener('finish', onFinish)
      const isParser = writer === parser
      writer = null

      if (isParser) {
        dispose((er) => {
          const k = schema.etag(uri)
          const v = res.headers['etag'] || 'NO_ETAG'
          batch.put(k, v)
          batch.write((er) => {
            if (er) this.emit('error', er)
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
    const unzip = zlib.createGunzip()
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
  const db = this.db
  const uri = qry.url

  getFeed(db, uri, (er, val) => {
    if (er) {
      if (!er.notFound) {
        this.emit('error', er)
      }
    } else if (val) {
      this.use(val, qry)
    }
    if (cb) cb()
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
  let opts = schema.entries(qry.url, qry.since, true)
  let values = this.db.createValueStream(opts)
  let ok = true

  const use = () => {
    if (!ok || !values) return
    let chunk
    while (ok && (chunk = values.read()) !== null) {
      ok = this.use(chunk, qry)
    }
    if (!ok) {
      this.once('drain', () => {
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
    if (cb) cb(er)
  }
  function onerror (er) {
    let error = new Error('retrieve error: ' + er.message)
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
  const key = bytewise.decode(chunk)
  const uri = key[1][1]
  this.push(uri)
  cb()
}

function list (db, opts) {
  const keys = db.createKeyStream(schema.allFeeds)
  const uris = new URLs({ objectMode: true })
  let ok = true
  function write () {
    let chunk
    while (ok && (chunk = keys.read()) !== null) {
      ok = uris.write(chunk)
    }
    if (!ok) uris.once('drain', ondrain)
  }
  function ondrain () {
    ok = true
    write()
  }
  function onerror (er) {
    const error = new Error('list error: ' + er.message)
    uris.emit('error', error)
    onend()
  }
  function onend () {
    keys.removeListener('end', onend)
    keys.removeListener('error', onerror)
    keys.removeListener('readable', write)
    uris.removeListener('drain', ondrain)
    uris.end()
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
  const uri = chunk.feed
  if (uri) {
    this.push(uri)
  } else {
    this.emit('error', new Error('feed without URL'))
  }
  cb()
}

// Updates all feeds in ranked order, hot feeds first, and returns a readable
// stream of updated feeds. Using ranks as input implies that `flushCounter`  has
// been run at least once before update has any effect. To reduce run time, the
// Feeds stream is multiplied by speculum.
//
// - x Number() | null | undefined The concurrency level defaults to one.
function update (db, opts, x) {
  const r = ranks(db, opts)

  const fopts = cp(opts)
  fopts.force = true
  fopts.objectMode = true

  const s = speculum({ objectMode: true }, () => {
    return new Feeds(db, fopts)
  }, x)

  let ok = true

  function ondrain () {
    ok = true
    write()
  }
  function write () {
    let chunk
    while (ok && (chunk = r.read()) !== null) {
      ok = s.write(chunk)
    }
    if (!ok) {
      s.once('drain', ondrain)
    }
  }
  // TODO: Review update input stream error handling
  //
  // What does it mean, if the ranks stream emits an error? Do we risk getting
  // stuck here? Should we better abort?
  //
  function onerror (er) {
    const error = new Error('update error: ' + er.message)
    s.emit('error', error)
  }
  function onend () {
    r.removeListener('end', onend)
    r.removeListener('error', onerror)
    r.removeListener('readable', write)

    s.end()
    s.removeListener('drain', ondrain)
  }
  r.once('end', onend)
  r.once('error', onerror)
  r.on('readable', write)

  return s
}

function getFeed (db, uri, cb) {
  const key = schema.feed(uri)
  db.get(key, cb)
}

function getETag (db, uri, cb) {
  const key = schema.etag(uri)
  db.get(key, cb)
}

// Normalize dates of feeds or entries.
// - thing feed() | entry()
function time (thing) {
  return query.time(thing.updated)
}

function newer (item, qry) {
  const a = item.updated
  const b = qry.since
  return b === 0 || a > b
}

function has (db, uri, cb) {
  getETag(db, uri, (er, etag) => {
    if (cb) cb(er)
  })
}

function remove (db, uri, cb) {
  has(db, uri, (er) => {
    if (er) {
      return cb ? cb(er) : null
    }
    function done (er) {
      keys.removeListener('data', ondata)
      keys.removeListener('end', onend)
      keys.removeListener('error', onerror)
      function error () {
        if (er) {
          return new Error('failed to remove: ' + er.message)
        }
      }
      if (cb) cb(error())
    }
    const opts = schema.entries(uri, Infinity)
    const keys = db.createKeyStream(opts)
    const batch = db.batch()
    batch.del(schema.etag(uri))
    batch.del(schema.feed(uri))
    function onerror (er) {
      done(er)
    }
    function ondata (chunk) {
      batch.del(chunk)
    }
    function onend () {
      batch.write((er) => { done(er) })
    }
    keys.on('data', ondata)
    keys.on('end', onend)
    keys.on('error', onerror)
  })
}

function flushCounter (db, counter, cb) {
  rank(db, counter, (er, count) => {
    if (!er) counter.reset()
    if (cb) cb(er, count)
  })
}

function cp (it) {
  const o = Object.create(null)
  return it ? Object.assign(o, it) : o
}

// Transforms rank keys to URLs.
function Ranks (opts) {
  if (!(this instanceof Ranks)) return new Ranks(opts)
  stream.Transform.call(this, opts)
  this._readableState.objectMode = opts.objectMode
}
util.inherits(Ranks, stream.Transform)

Ranks.prototype._transform = function (chunk, enc, cb) {
  const uri = schema.URIFromRank(chunk)
  debug('ranked: %s', uri)
  if (!this.push(uri)) {
    this.once('drain', cb)
  } else {
    cb()
  }
}

// Creates a new manger cache providing the main API of this package.
function Manger (name, opts) {
  if (!(this instanceof Manger)) return new Manger(name, opts)
  events.EventEmitter.call(this)

  this.opts = defaults(opts)
  this.opts.failures = lru({ max: 500, maxAge: 36e5 * 24 })
  this.opts.redirects = lru({ max: 500, maxAge: 36e5 * 24 })

  this.counter = lru({ max: this.opts.counterMax })

  const db = levelup(name, {
    keyEncoding: bytewise,
    cacheSize: this.opts.cacheSize
  })
  Object.defineProperty(this, 'db', { get: () => {
    if (!db || db.isClosed()) {
      this.emit('error', new Error('no database'))
    } else {
      return db
    }
  }})
}
util.inherits(Manger, events.EventEmitter)

function ranks (db, opts, limit) {
  const keys = db.createKeyStream(schema.ranks(limit))
  const ranks = new Ranks(cp(opts))
  function onend () {
    keys.removeListener('end', onend)
    keys.removeListener('error', onerror)
    ranks.end()
    ranks.removeListener('drain', ondrain)
  }
  function onerror (er) {
    ranks.emit('error', er)
    onend()
  }
  let ok = true
  function write () {
    let chunk
    while (ok && (chunk = keys.read()) !== null) {
      ok = ranks.write(chunk)
    }
    if (!ok) ranks.once('drain', ondrain)
  }
  function ondrain () {
    ok = true
    write()
  }
  keys.on('end', onend)
  keys.on('readable', write)
  keys.once('error', onerror)
  return ranks
}

// A readable stream of ranked URIs.
Manger.prototype.ranks = function (limit) {
  return ranks(this.db, this.opts, limit)
}

function resetRanks (db, cb) {
  const keys = db.createKeyStream(schema.allRanks)
  const batch = db.batch()
  function done (er) {
    keys.removeListener('end', onend)
    keys.removeListener('readable', read)
    keys.removeListener('error', onerror)
    function error () {
      if (er) {
        return new Error('failed to reset ranks: ' + er.message)
      }
    }
    if (cb) cb(error())
  }
  function onend (er) {
    batch.write((er) => {
      done(er)
    })
  }
  function onerror (er) {
    done(er)
  }
  function read () {
    let key
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
  const s = new Entries(this.db, this.opts)

  const onhit = (qry) => {
    const k = qry.uri()
    let c = this.counter.peek(k) || 0
    debug('hit: %s %s', k, c)
    this.counter.set(k, ++c)
  }
  function deinit () {
    s.removeListener('error', deinit)
    s.removeListener('finish', deinit)
    s.removeListener('hit', onhit)
  }
  s.once('error', deinit)
  s.once('finish', deinit)
  s.on('hit', onhit)

  return s
}

Manger.prototype.flushCounter = function (cb) {
  return flushCounter(this.db, this.counter, cb)
}

Manger.prototype.update = function (concurrencyLevel = 1) {
  return update(this.db, this.opts, concurrencyLevel)
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

if (process.mainModule.filename.match(/test/) !== null) {
  exports.Entries = Entries
  exports.Feeds = Feeds
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
