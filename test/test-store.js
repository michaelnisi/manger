
var test = require('tap').test
  , assert = require('assert')
  , st = require('st')
  , http = require('http')
  , pickup = require('pickup')
  , rimraf = require('rimraf')
  , fs = require('fs')
  , levelup = require('levelup')
  , join = require('path').join
  , path  = require('path')
  , child_process = require('child_process')
  , Writable = require('stream').Writable
  , manger = require('../')

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
/*

test('put feed', function (t) {
  var db = levelup(loc)
  var store = new manger.Store(db)
  var feed = { author:'Mule Radio Syndicate' }
  store.putFeed('feeds.feedburner.com/cre-podcast', feed, function (er) {
    t.ok(!er, 'should not error')
    db.close()
    t.end()
  })
})

test('get feed', function (t) {
  var db = levelup(loc)
  var store = new manger.Store(db)
  store.getFeed('some.url.somewhere', function (er, val) {
    t.ok(er, 'should error')
    t.ok(!val, 'should not have value')
  })
  var feed = { author:'Mule Radio Syndicate' }
  store.putFeed('feeds.feedburner.com/cre-podcast', feed, function (er) {
    t.ok(!er, 'should not error')
    store.getFeed('feeds.feedburner.com/cre-podcast', function (er, val) {
      t.ok(!er, 'should not error')
      t.ok(val, 'should have value')
      t.same(val, '{"author":"Mule Radio Syndicate"}')
      db.close()
      t.end()
    })
  })
})

test('write', function (t) {
  var db = levelup(loc)
  var store = new manger.Store(db)
  var tuples = [
    ['troubled.pro/rss.xml', 2013, 10]
  , ['feeds.muleradio.net/allmodcons', 2013]
  ]
  function write () {
    var tuple
      , ok = true
      , i = 0
    while (i < tuples.length && ok) {
      tuple = tuples[i++]
      ok = store.write(tuple)
    }
    if (i === tuples.length) store.end()
  }
  store.once('drain', write)
  store.on('finish', function () {
    var uri = null
    tuples.forEach(function (tuple, i) {
      uri = tuple[0]
      store.getFeed(uri, function (er, value) {
        t.ok(!er, 'should not error')
        if (i === tuples.length - 1) {
          db.close()
          t.end()
        }
      })
    })
  })
  write()
})
*/
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
