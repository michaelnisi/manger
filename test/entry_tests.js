
var test = require('tap').test
  , rimraf = require('rimraf')
  , levelup = require('levelup')
  , join = require('path').join
  , fs = require('fs')
  , manger = require('../')

test('setup', function (t) {
  fs.mkdirSync(dir(), 0700)
  t.ok(fs.statSync(dir()).isDirectory(), 'should exist')
  levelup(loc(), null, function (er, db) {
    t.ok(!er, 'should not error')
    _db = db
    t.end()
  })
})

// Details

var _db, _dir

function db () {
  if (!_db) _db = levelup(loc())
  return _db
}

function dir () {
  if (!_dir) _dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
  return _dir
}

function loc () {
  return join(dir(), 'test.db')
}
