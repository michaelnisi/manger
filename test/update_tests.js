
var test = require('tap').test
  , rimraf = require('rimraf')
  , levelup = require('levelup')
  , join = require('path').join
  , fs = require('fs')
  , assert = require('assert')
  , manger = require('../')

test('setup', function (t) {
  fs.mkdirSync(dir(), 0700)
  t.ok(fs.statSync(dir()).isDirectory(), 'should exist')
  levelup(loc(), null, function (er, db) {
    t.ok(!er, 'should not error')
    t.ok(db.isOpen(), 'should be open')
    _db = db
    t.end()
  })
})

test('update', function (t) {
  var put = manger.putEntry
    , update = manger.update
    , uri = 'feeds.feedburner.com/cre-podcast'

  put(db(), uri, entry(), function (er, key) {
    t.ok(!er, 'should not error')
    t.is(key, 'ent\u0000E1NEdRl1c7R5AWE/XrIr7Q==\u00002013\u000010\u000001')
    t.end()
  })
})

test('teardown', function (t) {
  db().close(function (er) {
    t.ok(!er, 'should not error')
    t.ok(db().isClosed(), 'should be closed')
    rimraf(dir(), function (er) {
      fs.stat(dir(), function (er) {
        t.ok(!!er, 'should clean up after ourselves')
        t.end()
      })
    })
  })
})

// Details

var _db, _dir

function db () {
  assert(_db)
  return _db
}

function dir () {
  if (!_dir) _dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
  return _dir
}

function loc () {
  return join(dir(), 'test.db')
}

function entry () {
  return {
    title: 'Mavericks'
  , updated: new Date(2013, 9, 1)
  }
}
