
// manger - proxy feeds

module.exports.Store = Store

if (process.env.TEST) {
  module.exports.keyFromDate = keyFromDate
  module.exports.keyFromUri = keyFromUri
  module.exports.keyFromTuple = keyFromTuple
}

var createHash = require('crypto').createHash
  , pickup = require('pickup')
  , http = require('http')
  , Writable = require('stream').Writable
  , Transform = require('stream').Transform
  , util = require('util')
  , assert = require('assert')
  , StringDecoder = require('string_decoder').StringDecoder

var decoder = new StringDecoder('utf8');

util.inherits(Store, Transform)
function Store (db) {
  if (!(this instanceof Store)) return new Store(db)
  Transform.call(this, { objectMode:true })
  assert(db)
  this.db = db
}

// expects tuples of the form ['url', 'year', 'month', 'day']
// where all but url is optional
Store.prototype._transform = function (tuple, enc, cb) {
  if (tuple === null) {
    this.push(null)
    cb()
    return
  }
  var uri = tuple[0]
    , isCached = false
    , me = this
  this.getFeed(uri, function (er, val) {
    isCached = !!val
    if (isCached) {
      this.push(val) // TODO: format?
      me.retrieve(tuple, cb)
    } else {
      me.request(tuple, cb)
    }
  })
}

Store.prototype.retrieve = function (tuple, cb) {
  var key = keyFromTuple(tuple)
  var stream = this.db.createReadStream({start:key})
  var me = this
    , buffer = [] // TODO: hm?
  stream.on('data', function (data) {
    buffer.push(data)
  })
  stream.on('end', function (er) {
    if (buffer.length > 0) {
      me.push(buffer)
      cb()
    } else {
      me.request(tuple, cb)
    }
  })
}

Store.prototype.request = function (tuple, cb) {
  var uri = tuple[0]
    , me = this
  http.get(['http://', uri].join(''), function (res) {
    res
      .pipe(pickup())
      .on('feed', function (feed) {
        me.push(feed)
        me.putFeed(uri, feed, function (er) {
          if (er) console.error(er)
        })
      })
      .on('entry', function (entry) {
        me.push(entry)
        me.putEntry(uri, entry, function (er) {
          if (er) console.error(er)
        })
      })
      .on('finish', cb)
  })
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

function keyFromDate (date) {
  var y = date.getFullYear()
  var m = date.getMonth() + 1
  var d = date.getDate()
  return [y, m, d].join('\\x00')
}

function keyFromUri (uri) {
  return createHash('md5').update(uri).digest('base64')
}

function keyFromTuple (tuple) {
  var tokens = tuple.slice(0)
  tokens[0] = keyFromUri(tokens[0])
  var key = tokens.join('\\x00')
  return key
}

