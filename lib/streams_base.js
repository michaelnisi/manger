'use strict'

/**
 * The streams_base module transforms data.
 */

const assert = require('assert')
const headary = require('headary')
const http = require('http')
const https = require('https')
const pickup = require('pickup')
const query = require('./query')
const schema = require('./schema')
const strings = require('./strings')
const zlib = require('zlib')
const { StringDecoder } = require('string_decoder')
const { Transform } = require('readable-stream')
const { defaults } = require('./conf')
const { inherits, debuglog } = require('util')
const { remove, getETag } = require('./db')

const debug = debuglog('manger')

exports.MangerTransform = MangerTransform
exports.charsetFromResponse = charsetFromResponse
exports.failureKey = failureKey
exports.newer = newer
exports.processQuery = processQuery
exports.sameEtag = sameEtag

/**
 * Abstract base class of feed and entry streams.
 */
function MangerTransform (db, opts) {
  if (!(this instanceof MangerTransform)) {
    return new MangerTransform(db, opts)
  }

  const o = defaults(opts)

  Transform.call(this, db, { highWaterMark: o.highWaterMark })

  this.counterMax = o.counterMax
  this.failures = o.failures
  this.force = o.force
  this.isEntry = o.isEntry
  this.isFeed = o.isFeed
  this.redirects = o.redirects
  this._readableState.objectMode = o.objectMode

  this._writableState.objectMode = true
  this.db = db
  this.decoder = new StringDecoder('utf8')
  this.state = 0
}

inherits(MangerTransform, Transform)

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

/**
 * A central method for pushing buffers or objects. Additionally, takes the
 * current query for handling redirects.
 *
 * Always go through here, never push directly!
 */
MangerTransform.prototype.use = function (chunk, qry) {
  const uri = qry.uri()
  const originalURL = qry.originalURL

  // While handling redirects and when in `objectMode`, we have to parse `chunk`.
  // The data, we’re trying to parse though, comes from within our own system,
  // should it be corrupt and thus `JSON` failing to parse it, we got nothing
  // and better crash. But we hardly ever parse at all and rarely stringify.

  let it
  let obj = typeof chunk === 'object'

  if (this._readableState.objectMode) {
    it = obj ? chunk : JSON.parse(chunk)
    it.url = uri
    it.originalURL = originalURL
  } else {
    if (originalURL) {
      if (!obj) {
        obj = true
        chunk = JSON.parse(chunk)
        chunk.url = uri
        chunk.originalURL = originalURL
      }
    }

    const chars = ['[', ',']
    if (obj) {
      it = chars[this.state] + JSON.stringify(chunk)
    } else { // main route
      it = chars[this.state] + chunk
    }

    if (this.state === 0) this.state = 1
  }

  return this.push(it)
}

function sameEtag (qry, res) {
  const a = qry.etag
  const b = res.headers['etag']
  return !!a && !!b && a === b
}

MangerTransform.prototype.httpModule = function (name) {
  if (name === 'http:') return [null, http]
  if (name === 'https:') return [null, https]
  return [new Error('invalid protocol')]
}

MangerTransform.prototype.head = function (qry, cb) {
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
    if (req.res.complete) return
    const er = new Error('aborted')
    done(er)
  }

  req.once('error', requestError)
  req.once('aborted', requestAborted)

  req.end()
}

/**
 * A String used to cache failed requests. The `method` is necessary to
 * differentiate `GET` and `HEAD` requests.
 */
function failureKey (method, uri) {
  assert(typeof method === 'string', `expected string: ${method}`)
  assert(typeof uri === 'string', `expected string: ${uri}`)
  return method + '-' + uri
}

/**
 * A redirect consisting of HTTP status code and new URL.
 */
function Redirect (code, url) {
  this.code = code
  this.url = url
}

/** 
 * Issues HTTP or HTTPS request for query and receives the response, applying
 * the callback when the received body has been parsed and stored.
 */
MangerTransform.prototype._request = function (qry, cb = () => {}) {
  const opts = qry.request()
  const [er, mod] = this.httpModule(opts.protocol)

  if (er) {
    this.emit('error', er)
    return cb ? cb() : null
  }

  const req = mod.get(opts)

  function removeListeners () {
    req.removeListener('error', onRequestError)
    req.removeListener('response', onResponse)
    req.removeListener('timeout', onTimeout)

    onParse = onRemove = onRemoveAfterRedirect = null
  }

  let done = (er) => {
    removeListeners()

    // The `notFound` property was set by levelup, marking this error irrelevant.
    if (er && !er.notFound) {
      er.url = qry.url
      this.emit('error', er)
    }

    if (cb) cb()

    done = () => {
      debug(new Error('done more than once'))
    }
  }

  // Managing the request

  const onRequestError = (er) => {
    debug('aborting request: %o', er)

    const key = failureKey('GET', qry.url)

    this.failures.set(key, er.message)

    // Without direct access to the parser, we prevent pushing after EOF with
    // these two rascals. We are MangerTransform.
    this.pushFeeds = false
    this.pushEntries = false

    req.abort()
    done(er)
  }

  req.once('error', onRequestError)

  // Monitoring the socket

  const onTimeout = () => {
    debug('socket timeout: %s', opts.hostname)
    req.abort()
  }

  req.once('timeout', onTimeout)
  req.setTimeout(5e3)

  // Receiving the reponse

  let onParse = (er) => { done(er) }
  let onRemove = (er) => { done(er) }
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

  req.once('response', onResponse)
}

function shouldRequestHead (qry) {
  return !!qry.etag && qry.etag !== 'NO_ETAG'
}

/**
 * Returns true if the `uri` should be ignored, `method` is used to distinct GET
 * and HEAD request, accepting that some servers aren’t implementing HTTP HEAD
 * properly.
 */
MangerTransform.prototype.ignore = function (method, uri) {
  const key = failureKey(method, uri)
  const has = this.failures.has(key)

  if (has) debug('ignoring: %s', uri)

  return has
}

const blacklist = RegExp([
  'ENOTFOUND'
  // TODO: Add more errors after which to abort after HEAD
].join('|'), 'i')

MangerTransform.prototype.request = function (qry, cb) {
  debug('%s', qry.url)

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
        if (sameEtag(qry, res)) {
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
        const code = h.permanent ? 301 : 302
        const nq = qry.redirect(code, h.url)
        if (!nq) {
          return done(new Error('too many redirects'))
        }

        // It gets fuzzy here: Should we set a redirect?
        // this.redirects.set(nq.originalURL, new Redirect(nq.code, nq.url))

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

/**
 * Returns normalized updated timestamp from `thing`.
 */
function time (thing) {
  return query.time(thing.updated)
}

function newer (item, qry) {
  const a = item.updated
  const b = qry.since
  return b === 0 || a > b
}

/** 
 * Parses response body for feeds and entries, unzipping it if necessary and
 * saves the found feeds and entries to the database. When finished, the
 * callback is applied. Usually without an error, for not aborting the stream,
 * just because a single query failed.
 * 
 * Run with `NODE_DEBUG=manger` to trace parse errors.
 */
MangerTransform.prototype.parse = function (qry, res, cb = () => {}) {
  const uri = qry.uri()
  const originalURL = qry.originalURL

  const rest = []
  const batch = this.db.batch()

  let ok = true

  const onFeed = (feed) => {
    try {
      feed.url = uri
      feed.originalURL = originalURL
  
      feed.updated = Math.max(time(feed), 1)
      feed.summary = strings.html(feed.summary)
  
      if (!this.isFeed(feed)) {
        return debug('invalid feed: %o', feed)
      }
  
      const [k, v] = [schema.feed(uri), JSON.stringify(feed)]
  
      batch.put(k, v)
  
      if (!ok) {
        rest.push(feed)
      } else if (this.pushFeeds) {
        ok = this.use(feed, qry)
      }
    } catch (error) {
      debug('unexpected feed: ( %s, %o, %o )', uri, feed, error)
    }
  }

  const onEntry = (entry) => {
    try {
      entry.url = uri
      entry.originalURL = originalURL

      entry.updated = Math.max(time(entry), 1)

      // Parsing the summary HTML makes this the hottest frame.
      entry.summary = strings.html(entry.summary)

      entry.duration = strings.duration(entry.duration)
      entry.id = strings.entryID(entry)
      entry.link = strings.entryLink(entry)

      if (!this.isEntry(entry)) {
        return debug('invalid entry: %o', entry)
      }

      const { id, updated } = entry
      const [k, v] = [schema.entry(uri, updated, id), JSON.stringify(entry)]

      batch.put(k, v)

      if (!ok) {
        rest.push(entry)
      } else if (this.pushEntries && newer(entry, qry)) {
        ok = this.use(entry, qry)
      }
    } catch (error) {
      debug('unexpected entry: ( %s, %o, %o )', uri, entry, error)
    }
  }

  const charset = charsetFromResponse(res)
  const opts = new PickupOpts(charset)
  const parser = pickup(opts)

  parser.on('entry', onEntry)
  parser.once('feed', onFeed)

  let done = (er) => {
    res.removeListener('aborted', onAborted)

    parser.removeListener('entry', onEntry)
    parser.removeListener('feed', onFeed)

    cb(er)

    done = () => {
      debug(new Error('done more than once'))
    }
  }

  // Handling 'aborted', we must consider a Node issue, where the event fires
  // even when the request was OK.
  //
  // https://github.com/nodejs/node/issues/18756
  const onAborted = () => {
    debug('request aborted: %s', uri)
    if (res.complete) return
    done()
  }

  res.once('aborted', onAborted)

  const dispose = (cb = () => {}) => {
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
        cb()
      }
    }

    if (!res.aborted && rest.length) {
      write()
    } else {
      cb()
    }
  }

  // Manages a pipeline from reader to writer.
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
      reader.removeListener('readable', write)
      reader.removeListener('error', onError)

      writer.removeListener('drain', onDrain)
      writer.end()
    }

    const onError = (er) => {
      debug('parse error: %o', er)

      const key = failureKey('GET', uri)

      this.failures.set(key, er.message)
      onEnd()
    }

    const onFinish = () => {
      writer.removeListener('error', onError)
      writer.removeListener('finish', onFinish)

      const isParser = writer === parser

      if (isParser) {
        dispose((er) => {
          const k = schema.etag(uri)
          const v = res.headers['etag'] || 'NO_ETAG'

          batch.put(k, v)
          batch.write((er) => {
            if (er) this.emit('error', er)
            done() // nextTick?
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
