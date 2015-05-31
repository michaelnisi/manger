var common = require('./lib/common')
var fs = require('fs')
var manger = require('../')
var nock = require('nock')
var test = require('tap').test
var path = require('path')

test('ETag', function (t) {
  t.plan(8)
  var scope = nock('http://feeds.5by5.tv')
  var headers = {
    'content-type': 'application/json',
    'ETAG': '55346232-18151'
  }
  var mocks = [
    { f: scope.get, code: 200 },
    { f: scope.head, code: 200 },
    { f: scope.head, code: 304 }
  ]
  mocks.forEach(function (mock) {
    mock.f('/b2w').reply(mock.code, function () {
      if (mock.f === scope.get) {
        var p = path.join(__dirname, 'data', 'b2w.xml')
        return fs.createReadStream(p)
      }
    }, headers)
  })
  var store = common.freshManger()
  var feeds = store.feeds()
  feeds.on('error', function (er) {
    t.fail('should not emit ' + er)
  })
  var chunk
  var chunks = ''
  feeds.on('readable', function () {
    while ((chunk = feeds.read()) !== null) {
      chunks += chunk
    }
  })
  feeds.on('finish', function () {
    var found = JSON.parse(chunks)
    // Forced queries only emit feeds that actually got updated.
    t.is(found.length, 2)
    var first = found[0]
    found.forEach(function (feed) {
      t.same(first, feed)
    })
    t.ok(scope.isDone())
  })
  var uri = 'http://feeds.5by5.tv/b2w'
  var qry = manger.query(uri, null, null, true)
  var queries = [uri, uri, qry, qry]
  queries.forEach(function (q) {
    t.ok(feeds.write(q))
  })
  feeds.end()
})

test('teardown', function (t) {
  t.ok(!common.teardown())
  t.end()
})
