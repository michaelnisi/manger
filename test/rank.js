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
  var db = common.freshManger().db
  t.plan(3)
  db.batch(ops, function (er) {
    t.is(er, undefined)
    cache.set('jkl', 5)
    rank(db, cache, function (er) {
      t.is(er, undefined)
      var opts = schema.allRanks
      opts.reverse = true
      var s = db.createKeyStream(opts)
      var found = []
      s.on('data', function (chunk) {
        found.push(bytewise.decode(chunk))
      })
      s.on('end', function () {
        var wanted = [
          ['manger', ['rank', 6, 'abc']],
          ['manger', ['rank', 5, 'jkl']],
          ['manger', ['rank', 4, 'ghi']],
          ['manger', ['rank', 2, 'def']]
        ]
        t.same(found, wanted)
      })
    })
  })
})

test('teardown', function (t) {
  t.ok(!common.teardown())
  t.end()
})
