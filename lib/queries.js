
// queries - regarding queries

module.exports.queries = Queries

if (process.env.NODE_TEST) {
  module.exports.tuple = tuple
}

var StringDecoder = require('string_decoder').StringDecoder
  , util = require('util')
  , Transform = require('stream').Transform

// Transform JSON queries() to tuples()
// queries() { "url":String(), "since":Date.UTC() }
// tuples() [String(), Date.UTC()]
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
    , index = 0
    , oct = null
    , term = null
    , end = -1

  function json (str) {
    term = JSON.parse(str)
  }

  while (index < buf.length) {
    oct = buf[index++]
    if (oct === 123) this._start = index - 1
    if (oct === 125) end = index
    if (this._start > -1 && end > -1) {
      var str = decode(buf.slice(this._start, end))
      try {
        json(str)
      } catch (er) {
        this.emit('error', new Error('Bad JSON'))
        break
      }
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
// - term { url:String(), since:Date.UTC() }
function tuple (term) {
  return [term.url, term.since || Date.UTC(1970, 0)]
}
