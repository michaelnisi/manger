
// pickup_to_puts - transform pickup to levelup puts

var Transform = require('stream').Transform
  , createHash = require('crypto').createHash
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

function hash (str) { return createHash('md5').update(str).digest('base64') }
function put_from_entry (json) {
  if (!json) return null
  try { var entry = JSON.parse(json) } catch(er) { return null }
  var k1 = hash(entry.id)
    , d1 = Date.parse(entry.updated)
    , k2 = hash(entry.id)
  var key = [k1, d1, k2].join('\\x00')
  var put = {
    type:'put', key:key, value:json
  }
  return put
}
module.exports.put_from_entry = put_from_entry
