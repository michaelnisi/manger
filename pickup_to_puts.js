
// pickup_to_puts - transform pickup to levelup puts

var Transform = require('stream').Transform
  , createEntryPut = require('./db').createEntryPut

module.exports = function () {
  var opts = { objectMode:true }
    , stream = new Transform(opts)

  stream._transform = function (chunk, enc, cb) {
    var op = createEntryPut(chunk)
    if (chunk != null && op === null) {
      cb()
      return
    }
    stream.push(op)
    cb()
  }

  stream._flush = function (cb) {
    cb()
  }

  return stream
}
