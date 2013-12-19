
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

test('update', function (t) {
  var put = manger.putEntry
    , update = manger.update
    , uri = 'feeds.feedburner.com/cre-podcast'

  put(db(), uri, entry(), function (er, key) {
    t.ok(!er, 'should not error')
    t.is(key, 'ent\u0000E1NEdRl1c7R5AWE/XrIr7Q==\u00002013\u000010\u000001')
    update(db())
      .on('data', console.error)
    db().close()
    t.end()
  })
})

test('teardown', function (t) {
  rimraf(dir(), function (err) {
    fs.stat(dir(), function (err) {
      t.ok(!!err, 'should clean up after ourselves')
      t.end()
    })
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

function entry () {
  return {
    title: 'Mavericks'
  , updated: new Date(2013, 9, 1)
  }
}
