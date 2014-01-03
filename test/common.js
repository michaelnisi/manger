
module.exports.setup = setup
module.exports.teardown = teardown
module.exports.db = db
module.exports.dir = dir
module.exports.loc = loc

var fs = require('fs')
  , levelup = require('levelup')
  , rimraf = require('rimraf')
  , path = require('path')

function setup (t) {
  t.plan(4)
  t.ok(process.env.NODE_TEST, 'should be defined')
  fs.mkdirSync(dir(), 0700)
  t.ok(fs.statSync(dir()).isDirectory(), 'should exist')
  levelup(loc(), null, function (er, db) {
    t.ok(!er, 'should not error')
    t.ok(db.isOpen(), 'should be open')
    _db = db
    t.end()
  })
}

function teardown (t) {
  t.plan(2)
  db().close()
  t.ok(db().isClosed(), 'should be closed')
  rimraf(dir(), function (er) {
    fs.stat(dir(), function (er) {
      t.ok(!!er, 'should be removed')
      t.end()
    })
  })
}

var _db
function db () {
  if (!_db) _db = levelup(loc())
  return _db
}

var _dir
function dir () {
  if (!_dir) _dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
  return _dir
}

function loc () {
  return path.join(dir(), 'test.db')
}

