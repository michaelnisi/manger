
module.exports = Manger

var assert = require('assert')
  , StringDecoder = require('string_decoder').StringDecoder
  , stream = require('stream')
  , util = require('util')
  , es = require('event-stream')
  , joke = require('joke')()
  , Queue = require('./lib/queue').Queue
  , Unstored = require('./lib/db').Unstored

logstdout()
var queue = new Queue()

util.inherits(Manger, stream.Transform)
function Manger (opts) {
  if (!(this instanceof Manger)) return new Manger(opts)
  stream.Transform.call(this)
  opts = opts || defaults()
  this.db = opts.db
}

Manger.prototype._transform = function (chunk, enc, cb) {
  var data = json(chunk)
  var urls = data ? data.feeds : null
  if (!urls || urls.count < 1) {
    this.push(null)
    cb()
    return
  }

  var unstored = new Unstored(this.db)
  var me = this
  es.readArray(urls)
    .pipe(unstored)
    .on('data', function (data) {
      var req = data
      if (!req.stored) {
        var queued = !queue.push(req)
        if (!queued) {
          // TODO: go ahead and do it
        }
      }
  }).on('end', function () {
    me.push('ok')
    cb()
  })
}

function readStream (db, start, end) {
  var opts = { start:start, end:end, keys:false, values:true }
  return db.createReadStream(opts)
}

function defaults() {
  var opts = Object.create(null)
  assert(opts.db)
  return opts
}

function json (buf) {
  var str = decode(buf)
  function parse (json) { return JSON.parse(json) }
  var res = null
  try { res = parse(str) } catch(er) { return res }
  return res
}

var decoder
function decode (buf) {
  decoder = decoder || new StringDecoder('utf8')
  return decoder.write(buf)
}

function inspect (obj) {
  return util.inspect(obj, { colors: true });
}

function logstdout () {
  joke
    .pipe(joke.stringify())
    .pipe(process.stdout);
}
