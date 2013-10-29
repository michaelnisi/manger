
// db - test database

var test = require('tap').test
  , rimraf = require('rimraf')
  , fs = require('fs')
  , levelup = require('levelup')
  , path  = require('path')
  , createEntryPut = require('../lib/db').createEntryPut

var dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
  , loc = path.join(dir, 'test.db')

test('setup', function (t) {
  fs.mkdirSync(dir, 0700)
  t.end()
})

test('populate', function (t) {
  var opts = {}
  levelup(loc, opts, function (er, db) {
    t.notok(er, 'should not error')
    t.ok(db, 'should have db')
    db.batch([
      { type: 'put', key: 'foo', value: 'afoovalue' }
    , { type: 'put', key: 'bar', value: 'abarvalue' }
    , { type: 'put', key: 'baz', value: 'abazvalue' }
    ], function (er) {
      t.notok(er, 'should not error')
      db.close(function (er) {
        t.notok(er, 'should not error')
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
