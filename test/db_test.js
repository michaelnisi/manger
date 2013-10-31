
// db - test database

var test = require('tap').test
  , assert = require('assert')
  , http = require('http')
  , pickup = require('pickup')
  , rimraf = require('rimraf')
  , fs = require('fs')
  , levelup = require('levelup')
  , path  = require('path')
  , Writable = require('stream').Writable
  , db = require('../lib/db')

var createEntryPut = require('../lib/db').createEntryPut
  , pickupTransform = require('../lib/pickup_to_puts')
  , createWriteStream = require('../lib/db').createWriteStream
  , Unstored = require('../lib/db').Unstored
  , FeedRequest = require('../lib/db').FeedRequest

var dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
  , loc = path.join(dir, 'test.db')
  , opts = {}

test('setup', function (t) {
  fs.mkdirSync(dir, 0700)
  t.ok(fs.statSync(dir).isDirectory(), 'should exist')
  t.end()
})

test('FeedRequest', function (t) {
  t.throws(function () {
    new FeedRequest()
  })
  var r = new FeedRequest('http://troubled.pro/rss.xml')
  t.same(r.from, new Date(0))
  t.ok(!r.stored)
  t.end()
})

test('unstored', function (t) {
  levelup(loc, opts, function (er, db) {
    t.notok(er, 'should not error')
    t.ok(db, 'should have db')

    var unstored = new Unstored(db)
    t.ok(unstored.readable && unstored.writable, 'should be duplex')

    var actual = []
    unstored.on('readable', function () {
      var chunk
      while (null !== (chunk = unstored.read())) {
        actual.push(chunk)
      }
    })
    t.ok(unstored.write('xx'))
    t.ok(unstored.write('xx'))
    t.ok(unstored.write('xx'))

    db.put('feed\\x00yy', 'yy', function (er) {
      t.ok(!er)
      t.ok(unstored.write('yy'))
      unstored.end()
    })
    unstored.on('end', function () {
      var expected = [
        new FeedRequest('xx', null, null, false)
      , new FeedRequest('xx', null, null, false)
      , new FeedRequest('xx', null, null, false)
      , new FeedRequest('yy', null, null, true)
      ]
      t.deepEqual(actual, expected)
      t.end()
    })
  })
})

/*
test('populate', function (t) {
  var opts = {}
  levelup(loc, opts, function (er, db) {
    t.notok(er, 'should not error')
    t.ok(db, 'should have db')
    http.get('http://troubled.pro/rss.xml', function (res) {
      t.ok(res, 'should respond')
      res
        .pipe(pickup())
        .pipe(pickupTransform())
        .pipe(createWriteStream(db))
        .on('finish', function () {
          db.close()
          t.end()
        })
    })
  })
})

test('create entry put', function (t) {
  t.equal(createEntryPut(null), null, 'should be null')
  t.equal(createEntryPut(undefined), null, 'should be null')

  var entry = '{"id":"http://troubled.pro/2013/03/learning-from-erlang.html","link":"http://troubled.pro/2013/03/learning-from-erlang.html","title":"Learning from Erlang","updated":"Wed, 06 Mar 2013 01:00:00 +0100"}'
  var key = 'BL7gkqIZT0wnOFHwUjCHAQ==\\x001362528000000'
  var expected = {
    type:'put', key:key, value:entry
  }

  var actual = createEntryPut(entry)
  t.ok(actual, 'should not be null')
  t.deepEquals(actual, expected, 'should be equal')
  t.end()
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
