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

test('rank', t => {
  const feeds = cache.feeds()
  const uri = 'http://just/b2w'
  feeds.end(uri)
  feeds.on('end', () => {
    cache.flushCounter(er => {
      if (er) throw er
      const ranks = cache.ranks()
      let found = ''
      ranks.on('data', chunk => { found += chunk })
      ranks.on('end', () => {
        t.is(found, uri)
        t.end()
      })
    })
  })
  feeds.resume()
})

test('remove', t => {
  t.plan(3)
  const uri = 'http://just/b2w'

  cache.has(uri, er => {
    if (er) throw er
    cache.remove(uri, er => {
      if (er) throw er
      cache.has(uri, er => { t.ok(er.notFound) })

      cache.db.createKeyStream()
        .on('data', chunk => { t.fail() })
        .on('end', () => { t.pass('should be empty') })

      const ranks = cache.ranks()
      let found = ''
      ranks.on('data', chunk => { found += chunk })
      ranks.on('end', () => {
        t.is(found, '')
      })
    })
  })
})

test('teardown', t => {
  t.ok(!common.teardown())
  t.end()
})
