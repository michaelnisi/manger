var common = require('./lib/common')
var bytewise = require('bytewise')
var lru = require('lru-cache')
var rank = require('../lib/rank')
var schema = require('../lib/schema')
var test = require('tap').test

function QueryCount (uri, count) {
  if (!(this instanceof QueryCount)) return new QueryCount(uri, count)
  this.uri = uri
  this.count = count
}

test('allFeeds', { skip: false }, function (t) {
  var db = common.freshManger().db
  var uris = ['abc', 'def', 'ghi']
  var ops = uris.map(function (uri) {
    var key = schema.feed(uri)
    return { type: 'put', key: key, value: '{}' }
  })
  t.plan(1)
  db.batch(ops, function (er) {
    if (er) throw er
    var f = rank.allFeeds
    f(db, function (er, found) {
      if (er) throw er
      var wanted = uris
      t.same(found, wanted)
    })
  })
})

test('rank', function (t) {
  var counts = [
    QueryCount('abc', 3),
    QueryCount('def', 1),
    QueryCount('ghi', 2)
  ]
  var cache = lru()
  counts.forEach(function (c) {
    cache.set(c.uri, c.count)
  })
  var ops = counts.map(function (c) {
    var key = schema.rank(c.uri, c.count)
    return { type: 'put', key: key, value: c.count }
  })

  var uncounted = ['jkl', 'mno', 'pqr']
  uncounted.forEach(function (uri) {
    var key = schema.feed(uri)
    var op = { type: 'put', key: key, value: '{}' }
    ops.push(op)
  })

  var db = common.freshManger().db
  t.plan(4)
  db.batch(ops, function (er) {
    if (er) throw er
    t.pass('batch applied callback')
    cache.set('jkl', 5)
    rank(db, cache, function (er, count) {
      if (er) throw er
      var wanted = [
        ['manger', ['rank', 6, 'abc']],
        ['manger', ['rank', 5, 'jkl']],
        ['manger', ['rank', 4, 'ghi']],
        ['manger', ['rank', 2, 'def']],
        ['manger', ['rank', 0, 'pqr']],
        ['manger', ['rank', 0, 'mno']]
      ]
      t.is(count, wanted.length)
      t.pass('rank applied callback')
      var opts = schema.allRanks
      opts.reverse = true
      var s = db.createKeyStream(opts)
      var found = []
      s.on('data', function (chunk) {
        found.push(bytewise.decode(chunk))
      })
      s.on('end', function () {
        t.same(found, wanted)
      })
    })
  })
})

test('teardown', function (t) {
  t.ok(!common.teardown())
  t.end()
})
