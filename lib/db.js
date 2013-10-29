
// db - db stuff

var createHash = require('crypto').createHash

module.exports.createEntryPut = createEntryPut

function createEntryPut (json) {
  if (!json) return null
  try { var entry = JSON.parse(json) } catch(er) { return null }
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
