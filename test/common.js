
// common - setup test db, etc.

module.exports.db = db
module.exports.dir = dir
module.exports.loc = loc
module.exports.opts = opts
module.exports.populate = populate
module.exports.queries = queries
module.exports.setup = setup
module.exports.teardown = teardown
module.exports.url = url
module.exports.urls = urls

var fs = require('fs')
  , levelup = require('levelup')
  , path = require('path')
  , rimraf = require('rimraf')
  , es = require('event-stream')
  , manger = require('../')
  , assert = require('assert')
  ;

function rnd () {
  return Math.floor(Math.random() * (1<<24))
}

var _dir
function dir () {
  return _dir || (_dir = '/tmp/manger-' + rnd())
}

function loc () {
  return path.join(dir(), 'test.db')
}

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

function files () {
  return ['b2w.xml', 'ddc.xml', 'rl.xml', 'rz.xml', 'tal.xml']
}

function url (file) {
  return ['http://localhost:1337', file].join('/')
}

function urls () {
  var urls = []
  return files().map(function (file) {
    return url(file)
  })
}

function queries () {
  return urls().map(function (feed) { return manger.query(feed) })
}

function populate (t) {
  es.readArray(queries())
    .pipe(manger.feeds(opts()))
    .on('finish', function () {
      t.end()
    })
}

var _db
function db () {
  return _db || (_db = levelup(loc()))
}

function opts () {
  return manger.opts(db())
}

function teardown (t) {
  t.plan(2)
  db().close()
  t.ok(db().isClosed(), 'should be closed')
  rimraf.sync(dir())
  t.throws(function () { fs.statSync(dir()) })
  t.end()
}
