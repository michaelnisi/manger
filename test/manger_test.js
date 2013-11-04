
var test = require('tap').test
  , assert = require('assert')
  , http = require('http')
  , pickup = require('pickup')
  , rimraf = require('rimraf')
  , fs = require('fs')
  , levelup = require('levelup')
  , path  = require('path')
  , Writable = require('stream').Writable
  , manger = require('../lib/manger.js')

var dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
  , loc = path.join(dir, 'test.db')

test('setup', function (t) {
  fs.mkdirSync(dir, 0700)
  t.ok(fs.statSync(dir).isDirectory(), 'should exist')
  t.end()
})

test('tuple from URL', function (t) {
  var urls = [
    ''
  , '/'
  , 'troubled.pro'
  , 'troubled.pro/rss.xml/2012/12/7'
  , 'troubled.pro/rss.xml/2012/12/07'
  ]
  var tuples = [
    null
  , null
  , ['troubled.pro']
  , ['troubled.pro/rss.xml', 2012, 12, 7]
  , ['troubled.pro/rss.xml', 2012, 12, 7]
  ]
  urls.forEach(function (uri, i) {
    t.deepEqual(manger.tupleFromUrl(uri), tuples[i])
  })
  t.end()
})

/*
test('is requested', function (t) {
  var fun = manger.newer
  t.ok(fun(new Date(2012, 8, 8), ['url', 2011, 10, 10]), 'should be newer')
  t.ok(!fun(new Date(2012, 8, 8), ['url', 2013, 10, 10], 'should be older'))
  t.ok(fun(new Date(2013, 11, 11), ['url', 2013, 10, 10]), 'should be newer')
  t.ok(fun(new Date(2013, 10, 11), ['url', 2013, 10, 10]), 'should be newer')
  t.ok(!fun(new Date(2013, 9, 9), ['url', 2013, 10, 10]), 'should be older')
  t.end()
})


test('key from Date', function (t) {
  var actual = [
    manger.keyFromDate(new Date('Dec 08, 2013'))
  , manger.keyFromDate(new Date('Jan 12, 2013'))
  ]
  var expected = [
    '2013\\x0012\\x008'
  , '2013\\x001\\x0012'
  ]
  t.deepEqual(actual, expected, 'should be expected')
  t.end()
})

test('put/get entry', function (t) {
  var db = levelup(loc)
  var store = new manger.Store(db)
  var entry = {
    title: 'Mavericks'
  , updated: new Date(2013, 9, 1)
  }
  var uri = 'feeds.feedburner.com/cre-podcast'
  store.putEntry(uri, entry, function (er, key) {
    t.ok(!er, 'should not error')
    store.getEntry([uri, 2013, 10, 1], function (er, val) {
      t.ok(!er, 'should not error')
      t.end()
      db.close()
    })
  })
})

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
  store.on('data', function (data) {
  })
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

test('teardown', function (t) {
  rimraf(dir, function (err) {
    fs.stat(dir, function (err) {
      t.ok(!!err, 'should clean up after ourselves')
      t.end()
    })
  })
})*/
