// rank - rank query counts

exports = module.exports = rank

var bytewise = require('bytewise')
var schema = require('./schema')
var stream = require('readable-stream')
var util = require('util')

util.inherits(Keys, stream.Transform)
function Keys (counter, opts) {
  if (!(this instanceof Keys)) return new Keys(counter, opts)
  stream.Transform.call(this, opts)
  var snapshot = {}
  counter.forEach(function (value, key) {
    snapshot[key] = value
  })
  this.snapshot = snapshot
}

Keys.prototype._transform = function (chunk, enc, cb) {
  var key = bytewise.decode(chunk)
  var uri = key[1][2]
  var count = key[1][1]
  var data = this.snapshot[uri]
  if (typeof data === 'number') {
    count += data
    delete this.snapshot[uri]
  }
  var newKey = schema.rank(uri, count)
  this.push(newKey)
  cb()
}

Keys.prototype._flush = function (cb) {
  var me = this
  var remaining = Object.getOwnPropertyNames(this.snapshot)
  remaining.forEach(function (uri) {
    var count = me.snapshot[uri]
    var key = schema.rank(uri, count)
    me.push(key)
  })
  cb()
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

function rank (db, counter, cb) {
  var prev = db.createKeyStream(schema.allRanks)
  var keys = new Keys(counter)
  var ops = []
  var key
  var ok = true
  function write () {
    while ((key = prev.read()) !== null) {
      var op = new Delete(key)
      ops.push(op)
      ok = keys.write(key)
    }
    if (!ok) key.once('drain', write)
  }
  function end () {
    keys.end()
  }
  function add () {
    var key = keys.read()
    var op = new Put(key)
    ops.push(op)
  }
  function batch () {
    db.batch(ops, function (er) {
      done(er)
    })
  }
  function done (er) {
    prev.removeListener('readable', write)
    keys.removeListener('readable', add)
    cb(er)
  }
  prev.on('readable', write)
  prev.once('error', done)
  prev.once('end', end)
  keys.on('readable', add)
  keys.once('error', done)
  keys.once('finish', batch)
}

if (parseInt(process.env.NODE_TEST, 10) === 1) {
  exports.Keys = Keys
}
