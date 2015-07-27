// rank - rank query counts

exports = module.exports = rank

var bytewise = require('bytewise')
var schema = require('./schema')
var stream = require('readable-stream')
var util = require('util')

// A Transform stream to update the rank index.
//
// - opts Object Plain stream options
// - snapshot Object A set of feeds
//
// A `snapshot` is a set of feeds, eg. { 'http://abc.de': 8, ... },
// where the property name is the URL of a feed and the value is its
// access count. The count gets added in the rank calculation.
function Keys (opts, snapshot) {
  if (!(this instanceof Keys)) return new Keys(opts, snapshot)
  stream.Transform.call(this, opts)
  this.snapshot = snapshot
}
util.inherits(Keys, stream.Transform)

// Update rank index keys considering the counter snapshot.
Keys.prototype._transform = function (chunk, enc, cb) {
  var key = bytewise.decode(chunk)
  var uri = key[1][2]
  var count = key[1][1]
  var data = this.snapshot[uri]
  if (typeof data === 'number') {
    count += data
    this.snapshot[uri] = null
  }
  var newKey = schema.rank(uri, count)
  this.push(newKey)
  cb()
}

Keys.prototype._flush = function (cb) {
  var me = this
  var snapshot = this.snapshot
  var uris = Object.getOwnPropertyNames(snapshot)
  var ok = true
  function write () {
    var uri
    while ((uri = uris.shift()) && ok) {
      var count = snapshot[uri]
      if (typeof count !== 'number') continue
      var key = schema.rank(uri, count)
      ok = me.push(key)
    }
    if (!ok) {
      me.once('drain', function () {
        ok = true
        write()
      })
    } else {
      me.snapshot = null
      snapshot = null
      uris = null
      me = null
      cb()
    }
  }
  write()
}

function Delete (key) {
  this.key = key
  this.type = 'del'
}

function Put (key) {
  this.key = key
  this.type = 'put'
  this.value = 0
}

function nop () {}

function allFeeds (db, cb) {
  cb = cb || nop
  var s = db.createKeyStream(schema.allFeeds)
  var uris = []
  function onend (er) {
    s.removeAllListeners()
    cb(er, uris)
    cb = nop
  }
  s.on('data', function (chunk) {
    var uri = schema.URIFromFeed(chunk)
    uris.push(uri)
  })
  s.on('end', onend)
  s.on('error', onend)
}

function rank (db, counter, cb) {
  cb = cb || nop
  allFeeds(db, function (er, all) {
    var snapshot = Object.create(null)
    all.forEach(function (uri) {
      snapshot[uri] = 0
    })
    counter.forEach(function (value, key) {
      snapshot[key] = value
    })
    var keys = new Keys(null, snapshot)
    var prev = db.createKeyStream(schema.allRanks)
    var ops = []
    function write () {
      var key
      var ok
      while ((key = prev.read()) !== null) {
        var op = new Delete(key)
        ops.push(op)
        ok = keys.write(key)
      }
      if (ok === false) keys.once('drain', write)
    }
    function end () {
      keys.end()
    }
    var count = 0
    function add () {
      var key
      while ((key = keys.read()) !== null) {
        count++
        var op = new Put(key)
        ops.push(op)
      }
    }
    function batch () {
      db.batch(ops, function (er) {
        done(er)
      })
    }
    function done (er) {
      prev.removeListener('readable', write)
      keys.removeListener('readable', add)
      cb(er, count)
      cb = nop
    }
    prev.on('readable', write)
    prev.once('error', done)
    prev.once('end', end)
    keys.on('readable', add)
    keys.once('error', done)
    keys.once('finish', batch)
  })
}

if (parseInt(process.env.NODE_TEST, 10) === 1) {
  exports.Keys = Keys
  exports.allFeeds = allFeeds
}
