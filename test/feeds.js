'use strict'

var assert = require('assert')
var common = require('./lib/common')
var fs = require('fs')
var nock = require('nock')
var path = require('path')
var stream = require('readable-stream')
var test = require('tap').test

test('a single plain query', function (t) {
  t.plan(7)
  var scope = nock('http://just')
  var headers = {
    'content-type': 'text/xml; charset=UTF-8',
    'ETAG': '55346232-18151'
  }
  scope.get('/b2w').reply(200, function () {
    var p = path.join(__dirname, 'data', 'b2w.xml')
    return fs.createReadStream(p)
  }, headers)

  var cache = common.freshManger()
  var feeds = cache.feeds()
  assert(feeds instanceof stream.Readable, 'should be Readable')
  var chunks = ''

  feeds.on('data', function (chunk) { chunks += chunk })
  feeds.on('end', function () {
    var p = path.join(__dirname, 'data', 'b2w.json')
    var data = fs.readFileSync(p)
    var wanted = JSON.parse(data)[150]
    wanted.feed = 'http://just/b2w'
    wanted.updated = Date.parse(wanted.updated)
    t.is(JSON.parse(chunks).map(function (found) {
      t.same(found, wanted)
    }).length, 2)
    t.is(cache.counter.itemCount, 0, 'should only count entries')
    t.ok(scope.isDone())
  })
  var uri = 'http://just/b2w'
  t.ok(feeds.write(uri))
  t.ok(feeds.write(uri), 'should not hit server')
  feeds.end()
})

test('teardown', function (t) {
  t.ok(!common.teardown())
  t.end()
})
