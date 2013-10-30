
module.exports = Manger

var assert = require('assert')
  , StringDecoder = require('string_decoder').StringDecoder
  , stream = require('stream')
  , util = require('util')
  , es = require('event-stream')
  , joke = require('joke')()

util.inherits(Manger, stream.Transform)

function Manger (opts) {
  if (!(this instanceof Manger)) return new Manger(opts)
  stream.Transform.call(this)
  logstdout()
}

Manger.prototype._transform = function (chunk, enc, cb) {
  var data = json(chunk)
  joke.info(data)
  this.push('{ "message": "received" }')
  cb()
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
