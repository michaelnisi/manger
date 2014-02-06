
var test = require('tap').test
  , keys = require('../lib/keys')

test('env', function (t) {
  t.plan(1)
  t.ok(process.env.NODE_TEST, 'should be defined')
  t.end()
})

test('key', function (t) {
  var f = keys.key
  t.plan(7)
  t.throws(function () { f(null) })
  t.throws(function () { f(undefined) })
  t.throws(function () { f('WTF', []) })
  t.throws(function () { f('WTF', ['http://example.org/feed.xml']) })
  var wanted = [
    'fed\u0000a9993e364706816aba3e25717850c26c9cd0d89d'
  , 'fed\u0000a9993e364706816aba3e25717850c26c9cd0d89d'
  , 'ent\u000013d0edad47191e06a3c91b56746d3103657a296a\u00000'
  ]
  ;[
    f(keys.FED, ['abc'])
  , f(keys.FED, ['abc', 0])
  , f(keys.ENT, ['http://example.org/feed.xml', 0])
  ].forEach(function (found, i) {
    t.is(found, wanted[i])
  })
  t.end()
})

test('hash', function (t) {
  t.plan(1)
  var f = keys.hash
    , wanted = [
    'c417d8fa4f0bf2e41995de8e4221deb0e2d3403a'
  ]
  ;[
    f('http://bit.ly/rss.xml')
  ].forEach(function (found, i) {
    t.is(found, wanted[i])
  })
  t.end()
})

