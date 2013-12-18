
var test = require('tap').test
  , st = require('st')
  , http = require('http')
  , rimraf = require('rimraf')
  , fs = require('fs')
  , levelup = require('levelup')
  , join = require('path').join
  , path  = require('path')
  , manger = require('../')
  , entries = require('../').entries
  , feeds = require('../').feeds
  , rstr = require('../').rstr

var dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
  , loc = join(dir, 'test.db')

test('setup', function (t) {
  fs.mkdirSync(dir, 0700)
  t.ok(fs.statSync(dir).isDirectory(), 'should exist')

  http.get(uri('nyt.xml'), function (res) {
    t.ok(res)
    t.end()
  }).on('error', function (er) {
    t.fail('server unavailable')
    t.end()
  })
})

test('put/get entry', function (t) {
  var db = levelup(loc)
  var entry = {
    title: 'Mavericks'
  , updated: new Date(2013, 9, 1)
  }
  var uri = 'feeds.feedburner.com/cre-podcast'
  manger.putEntry(db, uri, entry, function (er, key) {
    t.ok(!er, 'should not error')
    manger.getEntry(db, [uri, 2013, 10, 1], function (er, val) {
      t.ok(!er, 'should not error')
      t.end()
      db.close()
    })
  })
})

test('put feed', function (t) {
  var db = levelup(loc)
  var feed = { author:'NYT' }
  manger.putFeed(db, 'localhost:1337/nyt.xml', feed, function (er) {
    t.ok(!er, 'should not error')
    db.close()
    t.end()
  })
})

test('put/get feed', function (t) {
  var db = levelup(loc)
  manger.getFeed(db, 'some.url.somewhere', function (er, val) {
    t.ok(er, 'should error')
    t.ok(!val, 'should not have value')
  })
  var feed = { author:'NYT' }
  manger.putFeed(db, 'localhost:1337/nyt.xml', feed, function (er) {
    t.ok(!er, 'should not error')
    manger.getFeed(db, 'localhost:1337/nyt.xml', function (er, val) {
      t.ok(!er, 'should not error')
      t.ok(val, 'should have value')
      t.same(val, '{"author":"NYT"}')
      db.close()
      t.end()
    })
  })
})

test('pipe entries', function (t) {
  function json () {
    return JSON.stringify([
      { url:'localhost:1337/nyt.xml', since:Date.UTC(2013, 9) }
    ])
  }
  var db = levelup(loc)
  var writer = entries(db)
  var reader = rstr(json())

  reader
    .pipe(writer)
    .on('finish', function () {
      t.end()
    })
})

test('teardown', function (t) {
  rimraf(dir, function (err) {
    fs.stat(dir, function (err) {
      t.ok(!!err, 'should clean up after ourselves')
      t.end()
    })
  })
})

function uri (f) {
  return ['http://localhost:1337', f].join('/')
}
