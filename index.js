
// manger - cache feeds

module.exports.feeds = FeedStream
module.exports.entries = EntryStream
module.exports.update = update
module.exports.queries = require('./lib/queries').queries

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
  module.exports.stale = stale
  module.exports.date = date
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
  , parse = require('./lib/queries').parse
  , tuple = require('./lib/queries').tuple
  , etag = require('./lib/requests').etag

var ENT = 'ent' // ent\x00hash(feed_url)\x00YYYY\x00MM\x00DD
  , FED = 'fed' // fed\x00hash(feed_url)
  , DIV = '\x00'
  , END = '\xff'
  , ETG = 'etg'

var debug
if (process.env.NODE_DEBUG || process.env.NODE_TEST) {
  debug = function (o) { console.error('**manger: %s', o) }
} else {
  debug = function () { }
}

// Abstract base class for transform streams
// - opts
//   - db The database instance
//   - mode 1 | 2 (FRESH | CACHE) Defaults to 1 | 2
//   - log A bunyan log instance (https://github.com/trentm/node-bunyan)
var UPDATE_MODES = {
  FRESH: 1
, CACHE: 2
}
var MODS = ['[', ',']
util.inherits(ATransform, Transform)
function ATransform(opts) {
  if (!(this instanceof ATransform)) return new ATransform(opts)
  Transform.call(this)
  this._writableState.objectMode = true
  this._readableState.objectMode = false
  this._pushFeeds = false
  this._pushEntries = true

  this.db = opts.db
  this.mode = opts.mode || 1 | 2 // FRESH | CACHE
  this.log = opts.log
  this.state = 0
}

ATransform.prototype._flush = function(cb) {
  var chunk = this.state === 0 ? '[]' : ']'
  this.push(chunk)
  cb()
}

// Prepend output string according to state
ATransform.prototype.prepend = function(str) {
  var mod = MODS[this.state]
    , s = mod + str
  if (this.state === 0) this.state = 1
  return s
}

// Release resources
ATransform.prototype.destroy = function() {
  this.db = null
  this.rest = null
  release([this])
}

// Request via HTTP or retrieve from store
// taking to account in-flights and etags
ATransform.prototype._transform = function (tuple, enc, cb) {
  var me = this
  if (tuple) {
    var uri = tuple[0]
    getFeed(me.db, uri, function (er, val) {
      // TODO: That interesting! Really?
      if (stale(val, me.mode)) {
        if (val) {
          var feed = JSON.parse(val)
          changed(feed, uri, function (yes) {
            yes ? me.request(tuple, cb) : me.retrieve(tuple, cb)
          })
        } else {
          me.request(tuple, cb)
        }
      } else {
        me.retrieve(tuple, cb)
      }
    })
  } else { // need more
    cb()
  }
}

ATransform.prototype.uid = function (uri) {
  return [this.db.location, uri].join('~')
}

ATransform.prototype.shiftable = function (tuple, cb) {
  var stream
    , me = this

  if (!!(stream = inFlight(me.uid(tuple[0])))) {
    stream.on('end', function () {
      me.retrieve(tuple, cb)
    })
  }
  return !!stream
}

ATransform.prototype.request = function (tuple, cb) {
  var uri = tuple[0]
    , me = this

  if (me.shiftable(tuple, cb)) return

  http.get(['http://', uri].join(''), function (res) {
    res.pipe(pickup())
      .on('error', function (er) {
        me.error('Parser error')
        land(me.uid(uri))
        cb()
      })
      .on('feed', function (feed) {
        feed.feed = uri // TODO: Better name
        // TODO: Store etag to compare later
        var str = me.prepend(JSON.stringify(feed))
        if (me._pushFeeds) me.push(str)
        putFeed(me.db, uri, feed, function (er) {
          if (er) me.error(er)
        })
      })
      .on('entry', function (entry) {
        entry.feed = uri // just so we know
        var str = me.prepend(JSON.stringify(entry))
        if (me._pushEntries && newer(date(entry), tuple)) me.push(str)
        putEntry(me.db, uri, entry, function (er) {
          if (er) me.error(er)
        })
      })
      .on('finish', function () {
        land(me.uid(uri))
        cb()
      }).resume()

    fly(me.uid(uri), res)
  })
}

ATransform.prototype.toString = function () {
  return ['Manger ', this.constructor.name].join()
}

ATransform.prototype.error = function (x) {
  if (this.log) this.log.error(x)
}

ATransform.prototype.info = function (x) {
  if (this.log) this.log.info(x)
}

// Stream feeds
util.inherits(FeedStream, ATransform)
function FeedStream (opts) {
  if (!(this instanceof FeedStream)) return new FeedStream(opts)
  ATransform.call(this, opts)
  this._pushFeeds = true
  this._pushEntries = false
}

FeedStream.prototype.retrieve = function (tuple, cb) {
  var me = this
    , key = [FED, keyFromTuple(tuple)].join(DIV)

  me.db.get(key, function (er, val) {
    if (er) {
      me.error(er)
    } else if (val) {
      var str = me.prepend(val)
      me.push(str)
    }
    cb()
  })
}

// Stream entries
util.inherits(EntryStream, ATransform)
function EntryStream (opts) {
  if (!(this instanceof EntryStream)) return new EntryStream(opts)
  ATransform.call(this, opts)
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
  stream.on('error', me.error)
  stream.on('end', function () {
    cb()
  })
}

// Update all feeds (including entries) in store
// - db The database instance
function update (db) {
  var reader = db.createValueStream({ start:FED })
    , transf = new URLStream(db)
    , writer = new FeedStream({ db:db, mode:1 })

  reader
    .pipe(transf)
    .pipe(writer)

  return writer
}

// Transfrom stream values to tuples
util.inherits(URLStream, Transform)
function URLStream (db) {
  if (!(this instanceof URLStream)) return new URLStream(db)
  Transform.call(this)
  this._writableState.objectMode = false
  this._readableState.objectMode = true
  this._db = db
}

URLStream.prototype._transform = function (chunk, enc, cb) {
  var str = decode(chunk)
  try {
    var feed = JSON.parse(str)
      , tuple = tupleFromUrl(feed.feed)
    this.push(tuple)
  } catch (er) {
    this.error(er)
  }
  cb()
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
  var key = [FED, keyFromUri(uri)].join(DIV)
  db.get(key, cb)
}

// Release streams
// - streams Array of stream objects
function release (streams) {
  streams.forEach(function (stream) {
    stream.unpipe()
    stream.removeAllListeners()
  })
}

// Decode utf8 binary to string
// - buf utf8 encoded binary
var decoder = new StringDecoder()
function decode (buf) {
  return decoder.write(buf)
}

// true if value is stale and should be updated
// - val The value to check
// - mode The mode of the manger stream (1 | 2)
function stale (val, mode) {
  var cached = !!val
    , fresh  = mode === 1
    , cache  = mode === 2
  return (!cached || fresh) && !cache
}

function changed (feed, uri, cb) {
  etag(['http://', uri].join(''), function (et) {
    cb(feed.etag !== et)
  })
}

// Entry's date or now
function date (entry) {
  return entry.updated ? new Date(entry.updated) : new Date()
}

// Dictionary of request streams currently in-flight
var _flights
function flights () {
  if (!_flights) _flights = Object.create(null)
  return _flights
}

function inFlight (uid) {
  return flights()[uid]
}

function fly (uid, stream) {
  flights()[uid] = stream
}

function land (uid) {
  flights()[uid] = null
}
