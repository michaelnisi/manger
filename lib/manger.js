
// manger - proxy feeds

module.exports.Store = Store

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
  var uri = ['http://', tuple[0]].join('')
    , me = this
 http.get(uri, function (res) {
    res
      .pipe(pickup())
      .on('feed', function (feed) {
        me.push(feed)
      })
      .on('entry', function (entry) {
        me.push(entry)
      })
      .on('finish', cb)
  })
}

Store.prototype.getFeed = function (URI, cb) {
  var key = ['feed', keyFromURI(URI)].join('\\x00')
  this.db.get(key, function (er, val) {
    if (er && er.notFound) {
      cb()
    }
    cb(null, val)
  })
}

function keyFromURI (URI) {
  return createHash('md5').update(URI).digest('base64')
}

function keyFromTuple (tuple) {
  var tokens = tuple.slice(0)
  tokens[0] = keyFromURI(tokens[0])
  var key = tokens.join('\\x00')
  return key
}

