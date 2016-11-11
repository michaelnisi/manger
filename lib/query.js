'use strict'

// query - create queries

exports = module.exports = query
exports.Queries = Queries
exports.time = time

var stream = require('readable-stream')
var stringDecoder = require('string_decoder')
var url = require('url')
var util = require('util')

function trim (str) {
  if (typeof str !== 'string') return null
  var t = str.trim()
  const uri = url.parse(t)
  const valid = uri.protocol && uri.host
  if (!valid) return null
  return url.format(uri)
}

function query (str, since, etag, force) {
  const uri = trim(str)
  if (!uri) return null
  return new Query(uri, since, etag, force)
}

function time (t) {
  return new Date(t || 0).getTime()
}

// A query for a single feed.
//
// - url String()
// - since Unix Time or IETF-compliant RFC 2822 timestamp | 0
// - etag String() Entity tag | undefined
// - force Boolean() force request ignoring cache | false
function Query (url, since, etag, force) {
  if (!(this instanceof Query)) return new Query(url, since, etag, force)
  this.url = trim(url)
  this.since = time(since)
  this.etag = etag
  this.force = force || false
}

Query.prototype.clone = function (url, since, etag, force) {
  return query(
    url || this.url,
    since || this.since,
    etag || this.etag,
    typeof force === 'boolean' ? force : this.force
  )
}

var ports = {
  'http:': 80,
  'https:': 443
}

Query.prototype.request = function (method) {
  const headers = {
    'accept': '*/*',
    'accept-encoding': 'gzip',
    'user-agent': `nodejs/${process.version}`
  }
  if (this.etag) {
    headers['if-none-match'] = this.etag
  }

  var uri = url.parse(this.url)
  var port = ports[uri.protocol]
  var opts = {
    headers: headers,
    hostname: uri.hostname,
    method: method || 'GET',
    path: uri.path,
    port: uri.port || port,
    protocol: uri.protocol || 'http:'
  }

  return opts
}

// Transform JSON to queries.
// [{ "url":"http://abc", "since":"2014-06-07" }, ...]
// to queries of the form
// Query('http://abc', '2014-06-07')
function Queries (opts) {
  if (!(this instanceof Queries)) return new Queries(opts)
  stream.Transform.call(this, opts)
  this._decoder = new stringDecoder.StringDecoder()
  this._extra = null
  this._readableState.objectMode = true
  this._writableState.objectMode = false
  this._start = -1
}
util.inherits(Queries, stream.Transform)

Queries.prototype.buffer = function (chunk) {
  if (this._extra) {
    var tl = this._extra.length + chunk.length
    return Buffer.concat([this._extra, chunk], tl)
  }
  return chunk
}

Queries.prototype._flush = function (cb) {
  this._decoder = null
  this._extra = null
  cb()
}

Queries.prototype._transform = function (chunk, enc, cb) {
  var buf = this.buffer(chunk)
  var index = 0
  var oct = null
  var term = null
  var end = -1
  var er = null
  function json (str) {
    term = JSON.parse(str)
  }
  while (index < buf.length) {
    oct = buf[index++]
    if (oct === 123) this._start = index - 1
    if (oct === 125) end = index
    if (this._start > -1 && end > -1) {
      var str = this._decoder.write(buf.slice(this._start, end))
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
        var qry = query(term.url, term.since)
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
  // carry on.
    this.emit('warning', er)
  }

  cb()
}

if (parseInt(process.env.NODE_TEST, 10) === 1) {
  exports.Query = Query
  exports.time = time
  exports.trim = trim
}
