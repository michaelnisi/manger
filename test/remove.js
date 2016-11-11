'use strict'

var common = require('./lib/common')
var fs = require('fs')
var nock = require('nock')
var path = require('path')
var test = require('tap').test

var cache = common.freshManger()

test('setup', function (t) {
  t.plan(1)
  var scope = nock('http://just')
  var headers = {
    'content-type': 'text/xml; charset=UTF-8',
    'ETAG': '55346232-18151'
  }
  scope.get('/b2w').reply(200, function () {
    var p = path.join(__dirname, 'data', 'b2w.xml')
    return fs.createReadStream(p)
  }, headers)
  var feeds = cache.feeds()
  var buf = ''
  feeds.on('data', function (chunk) {
    buf += chunk
  })
  feeds.on('end', function () {
    JSON.parse(buf)
    t.pass('feed cached')
  })
  feeds.end('http://just/b2w')
})

test('remove', function (t) {
  t.plan(1)
  var uri = 'http://just/b2w'
  cache.has(uri, function (er) {
    if (er) throw er
    cache.remove(uri, function (er) {
      if (er) throw er
      cache.has(uri, function (er) {
        t.ok(er.notFound)
      })
    })
  })
})

test('teardown', function (t) {
  t.ok(!common.teardown())
  t.end()
})
