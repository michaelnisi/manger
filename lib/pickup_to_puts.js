
// pickup_to_puts - transform pickup to levelup puts

var Transform = require('stream').Transform
  , assert = require('assert')

module.exports = function () {
  var opts = { objectMode:true }
    , stream = new Transform(opts)

  stream._transform = function (chunk, enc, cb) {
    var entry = put_from_entry(chunk)
    if (chunk != null && entry === null) {
      cb()
      return
    }
    stream.push(entry)
    cb()
  }

  stream._flush = function (cb) {
    cb()
  }

  return stream
}

function put_from_entry (json) {
  if (!json) return null
  try { var entry = JSON.parse(json) } catch(er) { return null }
  var put = {
    type: 'put', key: entry.updated, value: json
  }

  return put
}
module.exports.put_from_entry = put_from_entry
