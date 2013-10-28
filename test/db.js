
// db - test database

var test = require('tap').test
  , rimraf = require('rimraf')
  , fs = require('fs')
  , levelup = require('levelup')
  , path  = require('path')
  , dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
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

test('teardown', function (t) {
  rimraf(dir, function (err) {
    fs.stat(dir, function (err) {
      t.ok(!!err, 'should clean up after ourselves')
      t.end()
    })
  })
})
