
// manger - cache feeds

module.exports.feeds = FeedStream
module.exports.entries = EntryStream
module.exports.update = update

module.exports.rstr = ReadableString

if (process.env.NODE_TEST) {
  module.exports.keyFromDate = keyFromDate
  module.exports.keyFromUri = keyFromUri
  module.exports.keyFromTuple = keyFromTuple
  module.exports.newer = newer
  module.exports.putFeed = putFeed
  module.exports.getFeed = getFeed
  module.exports.putEntry = putEntry
  module.exports.getEntry = getEntry
  module.exports.tupleFromUrl = tupleFromUrl
  module.exports.tuple = tuple
  module.exports.stale = stale
}

var createHash = require('crypto').createHash
  , assert = require('assert')
  , pickup = require('pickup')
  , http = require('http')
  , Transform = require('stream').Transform
  , util = require('util')
  , assert = require('assert')
  , StringDecoder = require('string_decoder').StringDecoder
  , url = require('url')

var ENT = 'ent' // ent\x00hash(feed_url)\x00YYYY\x00MM\x00DD
  , FED = 'fed' // fed\x00hash(feed_url)
  , DIV = '\x00'
  , END = '\xff'

// Stream feeds
// - opts
//   - db The database instance
//   - mode 1 | 2 (fresh | cache) Defaults to 1 | 2
util.inherits(FeedStream, Transform)
function FeedStream (opts) {
  if (!(this instanceof FeedStream)) return new FeedStream(db)
  Transform.call(this)
  this.db = opts.db
  this.mode = opts.mode || 1 | 2
  this.extra = null
}

FeedStream.prototype._transform = function (chunk, enc, cb) {
  if (chunk.readUInt8(0) === 42) { // TODO: Probably totally awesome
    // TODO: Get all feeds in store
    this.push(null)
    cb()
  } else {
    var me = this
      , re = parse(chunk, me.extra)
      , tuple = re[0]
    me.extra = re[1]
    if (tuple) {
      var uri = tuple[0]
      getFeed(me.db, uri, function (er, val) {
        if (stale(val, this.mode)) {
          me.request(tuple, cb)
        } else {
          console.error(val)
          this.push(val)
          cb()
        }
      })
    } else { // need more
      cb()
    }
  }
}

// Stream entries
// - opts
//   - db The database instance
//   - mode 1 | 2 (fresh | cache) Defaults to 1 | 2
util.inherits(EntryStream, Transform)
function EntryStream (opts) {
  if (!(this instanceof EntryStream)) return new EntryStream(opts)
  Transform.call(this)
  this.db = opts.db
  this.mode = opts.mode || 1 | 2 // fresh | cache
  this.state = 0
  this.extra = null
}

EntryStream.prototype._transform = function (chunk, enc, cb) {
  var me = this
    , re = parse(chunk, me.extra)
    , tuple = re[0]
  me.extra = re[1]
  if (tuple) {
    var uri = tuple[0]
    getFeed(me.db, uri, function (er, val) {
      if (stale(val, this.mode)) {
        me.request(tuple, cb)
      } else {
        me.retrieve(tuple, cb)
      }
    })
  } else { // need more
    cb()
  }
}

EntryStream.prototype._flush = function (cb) {
  var chunk = this.state === 0 ? '[]' : ']'
  this.push(chunk)
  cb()
}

EntryStream.prototype.retrieve = function (tuple, cb) {
  var start = [ENT, keyFromTuple(tuple)].join(DIV)
  var end = [ENT, keyFromUri(tuple[0]), keyFromDate(new Date())].join(DIV)
  var stream = this.db.createValueStream({start:start, end:end})
  var me = this
  stream.on('data', function (value) {
    var str = me.prepend(value)
    me.push(str)
  })
  stream.on('end', function (er) {
    cb()
  })
}

EntryStream.prototype.request = function (tuple, cb) {
  var uri = tuple[0]
    , me = this
  http.get(['http://', uri].join(''), function (res) {
    res.pipe(pickup())
      .on('error', function (er) {
        console.error(er)
        cb()
      })
      .on('feed', function (feed) {
        var str = JSON.stringify(feed)
        putFeed(me.db, uri, str, function (er) {
          if (er) console.error(er)
        })
      })
      .on('entry', function (entry) {
        entry.feed = uri // just so we know
        var str = me.prepend(JSON.stringify(entry))
        var date = entry.updated ? new Date(entry.updated) : new Date()
        if (newer(date, tuple)) me.push(str)
        putEntry(me.db, uri, entry, function (er) {
          if (er) console.error(er)
        })
      })
      .on('finish', function () {
        cb()
      }).resume()
  })
}

var mods = ['[', ','] // thought we'd need more
EntryStream.prototype.prepend = function (str) {
  var mod = mods[this.state]
    , s = mod + str
  if (this.state === 0) this.state = 1
  return s
}

// Transform values of stored feeds to queries
util.inherits(QueryStream, Transform)
function QueryStream () {
  if (!(this instanceof QueryStream)) return new QueryStream(db)
  Transform.call(this)
}

QueryStream.prototype._transform = function (chunk, enc, cb) {
  this.push(chunk)
}

// A readable string stream
// - str The string to stream/read
util.inherits(ReadableString, Transform)
function ReadableString (str) {
  if (!(this instanceof ReadableString)) return new ReadableString(str)
  Transform.call(this)
  this.buf = new Buffer(str)
}

ReadableString.prototype._read = function (size) {
  var ok = true
    , chunk = null
    , end = 0
  do {
    var buf = this.buf
    if (buf === null || buf.length === 0) {
      this.push(null)
      break
    }
    end = size || buf.length
    if (end > buf.length) end = buf.length
    chunk = buf.slice(0, end)
    ok = this.push(chunk)
    this.buf = buf.slice(end, buf.length - end)
  } while (ok && end > 0)
}

// miscellaneous functions

function tupleFromUrl (uri) {
  if (!uri || uri === '/') return null
  function indexOfFirstInt (tokens) {
    var i = 0
    while (i++ < tokens.length) {
      if (!isNaN(parseInt(tokens[i]))) return i
    }
    return tokens.length
  }
  var tokens = uri.split('/')
  var fi = indexOfFirstInt(tokens)
  var urlToken = tokens.slice(0, fi).join('/')
  var tupleToken = tokens.slice(fi, tokens.length)
  var tuple = [].concat(urlToken, tupleToken)
  return tuple
}

function newer (date, tuple) {
  var e = tupleFromDate(date)
  var y2 = e[0]
    , m2 = e[1]
    , d2 = e[2]
  var y1 = tuple[1] || 1970
    , m1 = tuple[2] || 1
    , d1 = tuple[3] || 1
  if (y1 < y2) return true
  if (y1 == y2) {
    if (m1 < m2) return true
    if (m1 > m2) return false
    if (m1 == m2) return d1 < d2
  }
  return false
}

function tupleFromDate (date) {
  date = date || new Date()
  var y = date.getFullYear()
    , m = date.getMonth() + 1
    , d = date.getDate()
  return [y, m, d]
}

function keyFromDate (date) {
  var tuple = tupleFromDate(date)
  var key = formatDateTuple(tuple)
  return key
}

function keyFromUri (uri) {
  return createHash('md5').update(uri).digest('base64')
}

function formatDateTuple (tuple) {
  var strs = []
  var str
  tuple.forEach(function (term) {
    str = term + ''
    if (str.length < 2) str = '0' + str
    strs.push(str)
  })
  return strs.join(DIV)
}

function keyFromTuple (tuple) {
  var tokens = tuple.slice(0)
  var uri = keyFromUri(tokens.shift())
  var date = formatDateTuple(tokens)
  return [uri, date].join(DIV)
}

function putEntry (db, uri, entry, cb) {
  var date = new Date(entry.updated)
  var key = [
  ENT
  , keyFromUri(uri)
  , keyFromDate(date)
  ].join(DIV)
  db.put(key, JSON.stringify(entry), function (er) {
    cb(er, key)
  })
}

function getEntry(db, tuple, cb) {
  var key = [ENT, keyFromTuple(tuple)].join(DIV)
  db.get(key, cb)
}

function putFeed(db, uri, feed, cb) {
  var key = [FED, keyFromUri(uri)].join(DIV)
  db.put(key, JSON.stringify(feed), cb)
}

function getFeed (db, uri, cb) {
  console.error('getFeed %s', uri)
  var key = [FED, keyFromUri(uri)].join(DIV)
  db.get(key, cb)
}

// Update whole store.
// - db The database instance
function update (db) {
  var reader = new FeedStream({ db:db, mode:2 })
    , transf = new QueryStream()
    , writer = new EntryStream({ db:db, mode:1 })
  reader.write('*')
  return reader.pipe(transf)// TODO: Take care of things
}

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

var decoder = new StringDecoder()
function decode (buf) {
  return decoder.write(buf)
}

function stale (val, mode) {
  var cached = !!val
    , fresh  = mode === 1
    , cache  = mode === 2
  return (!cached || fresh) && !cache
}

// Parse JSON
// - chunk The buffer or string to parse
// - rest  The rest from the previous parse (optional)
function parse (chunk, rest) {
  var con = null
  if (rest) {
    var tl = rest.length + chunk.length
    con = Buffer.concat([rest, chunk], tl)
    rest = null
  } else {
    con = chunk
  }
  var start = 0
    , end = 0
    , res = null
  while (end < con.length) {
    var split = -1
      , buf = con[end++]
    if (buf === 125) split = end
    if (split > -1) {
      var str = decode(con.slice(start, end))
        , term = null
      try {
        // assume we have a complete term
        term = JSON.parse(str.substr(1, str.indexOf('}')))
      } catch (er) {
        console.error('Invalid JSON')
        // TODO: What should we do?
      }
      start = end
      res = tuple(term)
    }
    rest = con.slice(start, con.length)
  }
  return [chunk, rest]
}
