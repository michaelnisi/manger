
var test = require('tap').test
  , stread = require('stread')
  , queries = require('../').queries
  , common = require('./common')
  , manger = require('../')

test('setup', function (t) {
  common.setup(t)
})

test('newer', function (t) {
  t.plan(3)
  var f = manger.newer
  var wanted = [
    false
  , false
  , true
  ]
  ;[
    f(Date.UTC(1970, 0), [])
  , f(Date.UTC(1970, 0), ['url', 0])
  , f(Date.UTC(1970, 1), ['url', 0])
  ].forEach(function (found, i) {
    t.is(found, wanted[i])
  })
  t.end()
})

test('put/get', function (t) {
  t.plan(9)
  var f = manger.putEntry
  t.ok(f, 'should be defined')
  var uri = 'feeds.feedburner.com/cre-podcast'
  var entry = {
    title: 'Mavericks'
  , updated: '2013-09-30T22:00:00.000Z'
  }
  f(common.db(), uri, entry, function (er, key) {
    t.ok(!er, 'should not error')
    t.ok(key, 'should be defined')
    t.is(key, 'ent\u0000e1bd8a1287db248534694f2cd83a6d49b9b8281a\u00001380578400000')
    manger.getEntry(common.db(), [uri, 1380578400000], function (er, val) {
      t.ok(!er, 'should not error')
      t.ok(!!val, 'should be defined')
      var found = JSON.parse(val), wanted = entry
      t.is(found.title, wanted.title)
      t.is(found.updated, wanted.updated)
      t.ok(!er, 'should not error')
      t.end()
    })
  })
})

/*
test('pipe', function (t) {
  var f = manger.entries
  t.ok(f, 'should be defined')
  function json () {
    return JSON.stringify([
      { url:'localhost:1337/logbuch-netzpolitik.xml'
      , since:Date.UTC(2013, 9)
      }
    ])
  }
  function opts () {
    return { db:common.db() }
  }
  function retrieve () {
    var data = ''
    stread(json())
      .pipe(queries())
      .pipe(f(opts()))
      .on('data', function (chunk) {
        data += chunk
      })
      .on('finish', function () {
        var found = JSON.parse(data)
        // TODO: test
        console.error(found)
        t.end()
      })
  }
  stread(json())
    .pipe(queries())
    .pipe(f(opts()))
    .on('finish', retrieve)
})
*/

test('teardown', function (t) {
  common.teardown(t)
})

