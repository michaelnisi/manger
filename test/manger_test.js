
var test = require('tap').test
  , assert = require('assert')
  , http = require('http')
  , pickup = require('pickup')
  , rimraf = require('rimraf')
  , fs = require('fs')
  , levelup = require('levelup')
  , path  = require('path')
  , Writable = require('stream').Writable
  , Store = require('../lib/manger').Store

var dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
  , loc = path.join(dir, 'test.db')

test('setup', function (t) {
  fs.mkdirSync(dir, 0700)
  t.ok(fs.statSync(dir).isDirectory(), 'should exist')
  t.end()
})

test('put feed', function (t) {
  var db = levelup(loc)
  var store = new Store(db)
  var feed = { author:'Mule Radio Syndicate' }
  store.putFeed('feeds.feedburner.com/cre-podcast', feed, function (er) {
    t.ok(!er)
    db.close()
    t.end()
  })
})

test('get feed', function (t) {
  var db = levelup(loc)
  var store = new Store(db)
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

test('Store', function (t) {
  var db = levelup(loc)
  var store = new Store(db)
  var tuples = [
    ['troubled.pro/rss.xml', 2013, 10]
  , ['feeds.muleradio.net/allmodcons', 2013]
  ]
  function write () {
    var tuple, ok = true, i = 0, len = tuples.length
    while (i < len && ok) {
      tuple = tuples[i++]
      ok = store.write(tuple)
    }
    if (i === len) store.end()
  }
  store.once('drain', write)
  store.on('data', function (data) {
  })
  store.on('finish', function () {
    db.close()
    t.end()
  })
  write()
})

test('teardown', function (t) {
  rimraf(dir, function (err) {
    fs.stat(dir, function (err) {
      t.ok(!!err, 'should clean up after ourselves')
      t.end()
    })
  })
})
