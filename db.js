
// db - db stuff

var createHash = require('crypto').createHash
  , stream = require('stream')
  , Writable = require('stream').Writable

module.exports.createEntryPut = createEntryPut
module.exports.createEntryGet = createEntryGet
module.exports.createWriteStream = createWriteStream

function createWriteStream (db) {
  var stream = new Writable({ objectMode:true })
  stream._write = function (chunk, enc, cb) {
    var op = chunk
    db.put(op.key, op.value, null, cb)
  }
  return stream
}

function createEntryGet () {
  // TODO: write
  return new DBOperation(null, null, null)
}

function createEntryPut (json) {
  if (!json) return null
  function parse (json) {
    return JSON.parse(json)
  }
  var entry = null
  try { entry = parse(json) } catch(er) { return entry }
  var k1 = createHash('md5').update(entry.id).digest('base64')
    , k2 = Date.parse(entry.updated)
  var key = [k1, k2].join('\\x00')

  return new DBOperation('put', key, json)
}

function DBOperation (type, key, value) {
  this.type = type
  this.key = key
  this.value = value
}
