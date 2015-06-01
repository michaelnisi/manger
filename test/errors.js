var common = require('./lib/common')
var test = require('tap').test

test('queries and requests', function (t) {
  function go (t, s) {
    var buf = ''
    s.on('data', function (chunk) {
      buf += chunk
    })
    var found = []
    s.on('error', function (er) {
      found.push(er)
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
    })
    function write (uris) {
      var ok = true
      var uri
      do {
        uri = uris.shift()
        if (uri) ok = s.write(uri)
      } while (ok && uri)
      if (!ok && uri) {
        s.once('drain', function () {
          write(uris)
        })
      }
      s.end()
    }
    write([
      'xxx',
      'http://xxx', // goes into failure cache
      'xxx',
      'http://xxx'
    ])
  }
  t.plan(2)
  t.test('feeds', function (t) {
    var store = common.freshManger()
    var feeds = store.feeds()
    t.plan(5)
    go(t, feeds)
  })
  t.test('entries', function (t) {
    var store = common.freshManger()
    var entries = store.entries()
    t.plan(5)
    go(t, entries)
  })
})

test('teardown', function (t) {
  t.ok(!common.teardown())
  t.end()
})
