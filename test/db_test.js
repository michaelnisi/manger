
// db - test database

var test = require('tap').test
  , assert = require('assert')
  , http = require('http')
  , pickup = require('pickup')
  , pickupTransform = require('../pickup_to_puts')
  , rimraf = require('rimraf')
  , fs = require('fs')
  , levelup = require('levelup')
  , path  = require('path')
  , createEntryPut = require('../db').createEntryPut
  , createWriteStream = require('../db').createWriteStream
  , Writable = require('stream').Writable

var dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
  , loc = path.join(dir, 'test.db')

test('setup', function (t) {
  fs.mkdirSync(dir, 0700)
  t.ok(fs.statSync(dir).isDirectory(), 'should exist')
  t.end()
})

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

test('teardown', function (t) {
  rimraf(dir, function (err) {
    fs.stat(dir, function (err) {
      t.ok(!!err, 'should clean up after ourselves')
      t.end()
    })
  })
})
