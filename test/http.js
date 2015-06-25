var common = require('./lib/common')
var fs = require('fs')
var manger = require('../')
var nock = require('nock')
var test = require('tap').test
var path = require('path')

test('ETag', { skip: false }, function (t) {
  t.plan(10)
  var scope = nock('http://feeds.5by5.tv')
  var headers = {
    'content-type': 'application/json',
    'ETag': '55346232-18151'
  }
  var mocks = [
    { f: scope.get, code: 200 },
    { f: scope.head, code: 200 },
    { f: scope.head, code: 304 }
  ]
  mocks.forEach(function (mock) {
    mock.f('/b2w').reply(mock.code, function (req, body) {
      if (mock.f === scope.get) {
        var p = path.join(__dirname, 'data', 'b2w.xml')
        return fs.createReadStream(p)
      }
      if (mock.f === scope.head) {
        var wanted = {
          'if-none-match': '55346232-18151',
          'accept-encoding': 'gzip',
          host: 'feeds.5by5.tv'
        }
        var found = this.req.headers
        t.same(found, wanted)
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

test('redirection', { skip: false }, function (t) {
  t.plan(4)
  var scopes = [
    nock('http://just'),
    nock('http://some')
  ]
  var headers = {
    'content-type': 'application/json',
    'ETag': '55346232-18151',
    'Location': 'http://some/ddc'
  }
  scopes[0].get('/b2w').reply(301, function () {
    t.pass(301)
  }, headers)
  scopes[1].get('/ddc').reply(200, function () {
    t.pass(200)
    var p = path.join(__dirname, 'data', 'ddc.xml')
    return fs.createReadStream(p)
  }, headers)
  var cache = common.freshManger()
  var x = Math.random() > 0.5
  var s = x ? cache.feeds() : cache.entries()
  var buf = ''
  s.on('data', function (chunk) {
    buf += chunk
  })
  s.on('end', function () {
    JSON.parse(buf)
    scopes.forEach(function (scope) {
      t.ok(scope.isDone(), 'scope should be done')
    })
  })
  s.end('http://just/b2w')
})

test('redirection of cached', function (t) {
  t.plan(5)
  var scopes = [
    nock('http://just'),
    nock('http://some')
  ]
  var headers = {
    'content-type': 'application/json',
    'Location': 'http://some/ddc'
  }
  scopes[0].get('/b2w').reply(200, function () {
    t.pass(200)
    var p = path.join(__dirname, 'data', 'b2w.xml')
    return fs.createReadStream(p)
  }, headers)
  scopes[0].get('/b2w').reply(301, function () {
    t.pass(301)
  }, headers)
  scopes[1].get('/ddc').reply(200, function () {
    t.pass(200)
    var p = path.join(__dirname, 'data', 'ddc.xml')
    return fs.createReadStream(p)
  }, headers)
  var cache = common.freshManger()
  var x = Math.random() > 0.5
  var s = x ? cache.feeds() : cache.entries()
  var buf = ''
  s.on('data', function (chunk) {
    buf += chunk
  })
  s.on('end', function () {
    JSON.parse(buf)
    scopes.forEach(function (scope) {
      t.ok(scope.isDone(), 'scope should be done')
    })
  })
  var uri = 'http://just/b2w'
  s.write(uri)
  var q = manger.query(uri, null, null, true)
  s.end(q)
})

test('teardown', function (t) {
  t.ok(!common.teardown())
  t.end()
})
