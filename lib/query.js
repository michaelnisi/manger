// query - all about queries

exports = module.exports = query
exports.Queries = Queries
exports.time = time

var stream = require('readable-stream')
var string_decoder = require('string_decoder')
var url = require('url')
var util = require('util')

function query (url, since, etag, force) {
  var uri = trim(url)
  return uri ? new Query(uri, since, etag, force) : null
}

function time (t) {
  return new Date(t || 0).getTime()
}

function trim (str) {
  if (!str) return null
  var uri = url.parse(str)
  var valid = uri.protocol && uri.host
  if (!valid) return null
  return url.format(uri)
}

// A query for a single feed.
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

var ports = {
  'http:': 80,
  'https:': 443
}

Query.prototype.request = function (method) {
  var headers
  if (this.etag) {
    headers = {
      'If-None-Match': this.etag
    }
  }
  var uri = url.parse(this.url)
  var port = ports[uri.protocol]
  var opts = {
    hostname: uri.hostname,
    port: uri.port || port,
    path: uri.path,
    method: method || 'GET',
    protocol: uri.protocol || 'http:'
  }
  if (headers) opts.headers = headers
  return opts
}

// Transform JSON to queries.
// [{ "url":"http://abc", "since":"2014-06-07" }, ...]
// to queries of the form
// Query('http://abc', '2014-06-07')
util.inherits(Queries, stream.Transform)
function Queries (opts) {
  if (!(this instanceof Queries)) return new Queries(opts)
  stream.Transform.call(this, opts)
  this._decoder = new string_decoder.StringDecoder()
  this._extra = null
  this._readableState.objectMode = true
  this._writableState.objectMode = false
  this._start = -1
}

Queries.prototype.buffer = function (chunk) {
  if (this._extra) {
    var tl = this._extra.length + chunk.length
    return Buffer.concat([this._extra, chunk], tl)
  }
  return chunk
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
        break
      }
      buf = buf.slice(end + 1, buf.length)
      this._start = -1
      end = -1
      index = 0
      var qry = query(term.url, term.since)
      if (qry) {
        this.push(qry)
      } else {
        er = new Error('invalid query')
        this.push(null)
        break
      }
    }
  }
  this._extra = buf
  cb(er)
}
