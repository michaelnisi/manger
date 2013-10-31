
module.exports.Queue = Queue

function Queue () {
  if (!(this instanceof Queue)) return new Queue()
  this.reqs = []
}
Queue.prototype.push = function (req) {
  var key = req.url
  if (this[key]) return false
  this[req.url] = req
  this.reqs.push(req)
  return true
}
Queue.prototype.pop = function () {
  var req = this.reqs.shift()
  if (req) this[req.key] = null
  return req || null
}
