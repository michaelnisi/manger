
var stream = require('stream')
  , util = require('util')

module.exports = function () {
  return new Manger()
}

function Manger (db) {
  var me = this
  stream.Transform.call(me)
}

util.inherits(Manger, stream.Transform)

Manger.prototype._transform = function (chunk, enc, cb) {
  this.push('{ "message": "received" }')
  cb()
}
