
// db - db stuff

var createHash = require('crypto').createHash

module.exports.createEntryPut = createEntryPut
module.exports.createEntryGet = createEntryGet

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
