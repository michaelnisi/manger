
// query - all about queries

exports.Queries = Queries
exports.Query = Query
exports.time = time

var util = require('util')
  , url = require('url')
  , stream = require('stream')
  , string_decoder = require('string_decoder')
  ;

function time (t) {
  return new Date(t || 0).getTime()
}

// A query for a single feed.
// - url String()
// - since Unix Time or IETF-compliant RFC 2822 timestamp | 0
// - etag String() Entity tag | undefined
function Query (url, since, etag) {
  if (!(this instanceof Query)) return new Query(url, since, etag)
  if (!url) throw new Error('no url')
  this.url = url
  this.since = time(since)
  this.etag = etag
}

Query.prototype.request = function () {
  var headers
  if (this.etag) {
    headers = {
      'If-None-Match': this.etag
    }
  }
  var uri = url.parse(this.url)
  var opts = {
    hostname: uri.hostname
  , port: uri.port || 80
  , path: uri.path
  }
  if (headers) opts.headers = headers
  return opts
}

// Transform JSON to queries.
// [{ "url":"http://abc", "since":"2014-06-07" }, ...]
// to queries of the form
// Query('http://abc', '2014-06-07')
util.inherits(Queries, stream.Transform)
function Queries(opts) {
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
    , index = 0
    , oct = null
    , term = null
    , end = -1
    , er = null
    ;
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
      } catch (er) {
        er = new Error('Bad JSON')
        break
      }
      buf = buf.slice(end + 1, buf.length)
      this._start = -1
      end = -1
      index = 0
      this.push(new Query(term.url, term.since))
    }
  }
  this._extra = buf
  cb(er)
}
