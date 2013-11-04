
// manger - proxy feeds

module.exports.Store = Store
module.exports.tupleFromUrl = tupleFromUrl

if (process.env.NODE_TEST) {
  module.exports.keyFromDate = keyFromDate
  module.exports.keyFromUri = keyFromUri
  module.exports.keyFromTuple = keyFromTuple
  module.exports.newer = newer
}

var createHash = require('crypto').createHash
  , pickup = require('pickup')
  , http = require('http')
  , Writable = require('stream').Writable
  , Transform = require('stream').Transform
  , util = require('util')
  , assert = require('assert')
  , url = require('url')

util.inherits(Store, Transform)
function Store (db) {
  if (!(this instanceof Store)) return new Store(db)
  Transform.call(this, { objectMode:true })
  this.db = db
  this.state = 0
}

// expects tuples of the form ['url', 'year', 'month', 'day']
// where all but url is optional
Store.prototype._transform = function (tuple, enc, cb) {
  if (tuple === null) {
    this.push(null)
    cb()
    return
  }
  if (!this.state) {
    this.push('{"r":[')
    this.state = 1
  }
  var uri = tuple[0]
    , isCached = false
    , me = this
  this.getFeed(uri, function (er, val) {
    if (val) assert(typeof val === 'string')
    isCached = !!val
    if (isCached) {
      me.retrieve(tuple, cb)
    } else {
      me.request(tuple, cb)
    }
  })
}

Store.prototype._flush = function (cb) {
  this.push(']}')
  cb()
}

Store.prototype.retrieve = function (tuple, cb) {
  var start = ['entry', keyFromTuple(tuple)].join('\\x00')
  var end = [
      'entry', keyFromUri(tuple[0]),
      keyFromDate(new Date())
  ].join('\\x00')
  var stream = this.db.createReadStream({start:start, end:end})
  var me = this
  stream.on('data', function (data) {
    var str = me.prepend(data.value)
    me.push(str)
  })
  stream.on('end', function (er) {
    cb()
  })
}

Store.prototype.request = function (tuple, cb) {
  var uri = tuple[0]
    , me = this
  http.get(['http://', uri].join(''), function (res) {
    res
      .pipe(pickup())
      .on('error', function (er) {
        me.push(null) // TODO: hm?
      })
      .on('feed', function (feed) {
        var str = JSON.stringify(feed)
        // TODO: push feed
        me.putFeed(uri, str, function (er) {
          if (er) console.error(er)
        })
      })
      .on('entry', function (entry) {
        var str = me.prepend(JSON.stringify(entry))
        var date = entry.updated ? new Date(entry.updated) : new Date()
        if (newer(date, tuple)) me.push(str)
        me.putEntry(uri, entry, function (er) {
          if (er) console.error(er)
        })
      })
      .on('finish', function () {
        cb()
      }).resume()
  })
}

Store.prototype.prepend = function (str) {
  var s = (this.state === 2 ? ',' : '') + str
  this.state = 2
  return s
}

// where uri is the feed's url
Store.prototype.putEntry = function (uri, entry, cb) {
  var date = new Date(entry.updated)
  var key = [
    'entry'
  , keyFromUri(uri)
  , keyFromDate(date)
  ].join('\\x00')
  this.db.put(key, JSON.stringify(entry), function (er) {
    cb(er, key)
  })
}

Store.prototype.getEntry = function (tuple, cb) {
  var key = ['entry', keyFromTuple(tuple)].join('\\x00')
  this.db.get(key, cb)
}

Store.prototype.putFeed = function (uri, feed, cb) {
  var key = ['feed', keyFromUri(uri)].join('\\x00')
  this.db.put(key, JSON.stringify(feed), cb)
}

Store.prototype.getFeed = function (uri, cb) {
  var key = ['feed', keyFromUri(uri)].join('\\x00')
  this.db.get(key, cb)
}

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
    if (m1 == m2) {
      return d1 < d2
    }
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
  return strs.join('\\x00')
}

function keyFromTuple (tuple) {
  var tokens = tuple.slice(0)
  var uri = keyFromUri(tokens.shift())
  var date = formatDateTuple(tokens)
  var key = [uri, date].join('\\x00')
  return key
}
