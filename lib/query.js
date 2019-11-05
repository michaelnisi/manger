'use strict'

// query - create queries

const assert = require('assert')
const { Transform } = require('readable-stream')
const stringDecoder = require('string_decoder')
const url = require('url')

function trim (str) {
  if (typeof str !== 'string') return null

  const t = str.trim()
  const uri = url.parse(t)
  const valid = uri.protocol && uri.host

  if (!valid) return null

  return url.format(uri)
}

function time (t) {
  return new Date(t || 0).getTime()
}

/**
 * A query for a single feed.
 */
class Query {
  /**
   * Creates a new query.
   *
   * @param {String} url
   * @param {*} since Unix Time or IETF-compliant RFC 2822 timestamp | 0
   * @param {String} etag Entity tag | undefined
   * @param {Boolean} force Force HTTP request ignoring cache | false
   * @param {*} code The HTTP status code | undefined
   * @param {*} count Counts redirects | 0
   * @param {*} originalURL The originally requested URL | undefined
   */
  constructor (url, since, etag, force = false, code, count = 0, originalURL) {
    this.url = trim(url)
    this.since = time(since)
    this.etag = etag
    this.force = force

    // Handling HTTP redirects

    this.code = code
    this.count = count
    this.originalURL = trim(originalURL) || undefined
  }

  /**
   * The original URL.
   */
  get uri () {
    return this.code === 302 ? this.originalURL : this.url
  }

  // Returns a redirected query from this query if the redirection limit,
  // currently five, is not exceeded.
  //
  // - code Number() The HTTP status code, 301 or 302.
  // - url String() The new URL.
  redirect (code, url) {
    assert(typeof code === 'number')
    assert(typeof url === 'string')

    const count = this.count + 1
    if (count > 5) return

    const nq = new Query(
      url,
      this.since,
      this.etag,
      this.force,
      code,
      count,
      this.url
    )

    // The new URL might not be valid.
    if (nq.url) return nq
  }

  request (method) {
    const headers = {
      'accept': '*/*',
      'accept-encoding': 'gzip',
      'user-agent': `nodejs/${process.version}`
    }
    if (this.etag) {
      headers['if-none-match'] = this.etag
    }

    const uri = url.parse(this.url)
    const port = Query.ports[uri.protocol]
    const opts = {
      headers: headers,
      hostname: uri.hostname,
      method: method || 'GET',
      path: uri.path,
      port: uri.port || port,
      protocol: uri.protocol || 'http:'
    }

    return opts
  }
}

Query.ports = {
  'http:': 80,
  'https:': 443
}

// A failable factory function.
Query.createQuery = (str, since, etag, force, code, count, originalURL) => {
  const uri = trim(str)

  if (!uri) return null
  return new Query(uri, since, etag, force, code, count, originalURL)
}

/**
 * Transforms a request payload to queries.
 */
class Queries extends Transform {
  constructor (opts) {
    super(opts)

    this._decoder = new stringDecoder.StringDecoder()
    this._extra = null
    this._readableState.objectMode = true
    this._writableState.objectMode = false
    this._start = -1
  }

  buffer (chunk) {
    if (this._extra) {
      const tl = this._extra.length + chunk.length

      return Buffer.concat([this._extra, chunk], tl)
    }

    return chunk
  }

  _flush (cb) {
    this._decoder = null
    this._extra = null

    cb()
  }

  _transform (chunk, enc, cb) {
    let buf = this.buffer(chunk)
    let index = 0
    let oct = null
    let term = null
    let end = -1
    let er = null

    const json = (str) => {
      term = JSON.parse(str)
    }

    while (index < buf.length) {
      oct = buf[index++]
      if (oct === 123) this._start = index - 1
      if (oct === 125) end = index
      if (this._start > -1 && end > -1) {
        const str = this._decoder.write(buf.slice(this._start, end))
        try {
          json(str)
        } catch (ex) {
          er = new Error('query error: invalid JSON')
        }
        buf = buf.slice(end + 1, buf.length)
        this._start = -1
        end = -1
        index = 0
        if (term) {
          const qry = Query.createQuery(term.url, term.since)
          if (qry) {
            this.push(qry)
          } else {
            er = new Error('query error: invalid query')
          }
        }
        term = null
      }
    }

    this._extra = buf

    if (er) {
      // In Node, when a readable stream emits an 'error', it breaks the pipe, to
      // prevent this, although this is an error, we tactfully emit a 'warning' and
      // carry on. I don’t like this!
      this.emit('warning', er)
    }

    cb()
  }
}

exports = module.exports = Query.createQuery

exports.Queries = Queries
exports.time = time
exports.Query = Query

if (process.mainModule.filename.match(/test/) !== null) {
  exports.time = time
  exports.trim = trim
}
