
// db - db related stuff

module.exports.Unstored = Unstored
module.exports.FeedRequest = FeedRequest

var createHash = require('crypto').createHash
  , stream = require('stream')
  , Writable = stream.Writable
  , Transform = stream.Transform
  , util = require('util')
  , assert = require('assert')
  , StringDecoder = require('string_decoder').StringDecoder

var decoder = new StringDecoder('utf8');

function FeedRequest (url, from, to, stored) {
  if (!(this instanceof FeedRequest)) {
    return new FeedRequest(url, from, to, stored)
  }
  assert(url)
  this.url = url
  this.from = from || new Date(0)
  this.to = to || new Date()
  this.stored = stored === undefined || stored === null ? false : stored
}

util.inherits(Unstored, stream.Transform)
function Unstored (db) {
  if (!(this instanceof Unstored)) return new Unstored(db)
  var opts = Object.create(null)
  opts.objectMode = true
  stream.Transform.call(this, opts)
  assert(db)
  this.db = db
}
Unstored.prototype._transform = function (chunk, enc, cb) {
  var me = this, db = me.db
    , url = decoder.write(chunk)
    , key = ['feed', url].join('\\x00')
  db.get(key, function (er, value) {
    var r = new FeedRequest(url)
    r.stored = !er
    me.push(r)
    cb()
  })
}

// Whatever
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
