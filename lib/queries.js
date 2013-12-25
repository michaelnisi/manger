
// queries - regarding queries

module.exports.queries = Queries

if (process.env.NODE_TEST) {
  module.exports.tuple = tuple
}

var StringDecoder = require('string_decoder').StringDecoder
  , util = require('util')
  , Transform = require('stream').Transform

// Transform JSON queries() to tuples()
// queries() { "url":"feed.me", "since":"1387843200000" }
// tuples() [url, year, month, day, hours, min, sec]
util.inherits(Queries, Transform)
function Queries() {
  if (!(this instanceof Queries)) return new Queries()
  Transform.call(this)
  this._writableState.objectMode = false
  this._readableState.objectMode = true
  this._extra = null
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
    , oct = null
    , term = null
    , end = -1

  while (index < buf.length) {
    oct = buf[index++]
    if (oct === 123) this._start = index - 1
    if (oct === 125) end = index
    if (this._start > -1 && end > -1) {
      var str = decode(buf.slice(this._start, end))
      term = JSON.parse(str)
      buf = buf.slice(end + 1, buf.length)
      this._start = -1
      end = -1
      index = 0
      this.push(tuple(term))
    }
  }
  this._extra = buf
  cb()
}

// Decode utf8 binary to string
// - buf utf8 encoded binary
var decoder = new StringDecoder()
function decode (buf) {
  return decoder.write(buf)
}

// Create tuple from term
// - term { url:String, since:Date }
function tuple (term) {
  var url = term.url
    , since = term.since || 0
    , date = new Date(since)
    , year = date.getUTCFullYear()
    , month = date.getUTCMonth()
    , day = date.getUTCDate()
    , hours = date.getUTCHours()
    , min = date.getUTCMinutes()
    , sec = date.getUTCSeconds()
  return [url, year, month, day, hours, min, sec]
}
