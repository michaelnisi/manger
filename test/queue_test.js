
var test = require('tap').test
  , Queue = require('../lib/queue').Queue

test('Queue', function (t) {
  function thing (url) {
    return { url:url }
  }
  var queue = new Queue()
  t.ok(queue != undefined, 'should be defined')
  var urls = ['aa', 'bb', 'cc']
  urls.forEach(function (url) {
    t.ok(queue.push(thing(url)), 'should push')
    t.ok(!queue.push(thing(url)), 'should not push')
  })
  var req
  while (null !== (req = queue.pop())) {
    t.equal(req.url, urls.shift())
  }
  t.equal(queue.pop(), null)
  t.end()
})
