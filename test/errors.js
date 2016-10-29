var common = require('./lib/common')
var test = require('tap').test

test('queries and requests', function (t) {
  function go (s, t) {
    var found = []
    s.on('error', function (er) {
      found.push(er)
    })

    var buf = ''
    s.on('readable', function () {
      var chunk
      while ((chunk = s.read()) !== null) { buf += chunk }
    })
    // Failed requests are cached, an error is emitted only for the first
    // failure per URL. Invalid queries do not produce requests, so errors
    // are emitted for each of those.
    var wanted = [
      'invalid query',
      'getaddrinfo ENOTFOUND',
      'invalid query'
    ]
    s.on('finish', function () {
      t.same(JSON.parse(buf), [])
      t.is(found.length, wanted.length)
      wanted.forEach(function (it) {
        t.ok(found.shift().message.match(new RegExp(it)))
      })
      t.end()
    })

    t.ok(s.write('abc'))
    t.ok(s.write('http://def'))
    t.ok(s.write('ghi'))
    t.ok(s.write('http://def'))
    s.end()
  }

  t.plan(2)
  t.test('feeds', function (t) {
    var store = common.freshManger()
    var feeds = store.feeds()
    go(feeds, t)
  })
  t.test('entries', function (t) {
    var store = common.freshManger()
    var entries = store.entries()
    go(entries, t)
  })
})

test('teardown', function (t) {
  t.ok(!common.teardown())
  t.end()
})
