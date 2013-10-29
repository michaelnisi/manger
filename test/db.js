
// db - test database

var test = require('tap').test
  , assert = require('assert')
  , http = require('http')
  , pickup = require('pickup')
  , pickupTransform = require('../lib/pickup_to_puts')
  , rimraf = require('rimraf')
  , fs = require('fs')
  , levelup = require('levelup')
  , path  = require('path')
  , createEntryPut = require('../lib/db').createEntryPut
  , Writable = require('stream').Writable

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

    var url = 'http://troubled.pro/rss.xml' // TODO: write test server
    var ops = []
    var writer = new Writable({ objectMode:true })
    writer._write = function (chunk, enc, cb) {
      ops.push(chunk)
      cb()
    }

    http.get(url, function (res) {
      t.ok(res, 'should respond')
      var s = pickupTransform()
      res
        .pipe(pickup())
        .pipe(s)
        .pipe(writer)
        .on('finish', function () {
          t.ok(ops.length > 0, 'should not be empty')
          ops.forEach(function (op) {
            t.equal(op.type, 'put', 'should be put')
          })
          batch(db, ops,t)
        })
    })
  })
})

function batch(db, ops, t) {
  db.batch(ops, function (er) {
    assert(!er)
    db.close(function (er) {
      assert(!er)
      t.end()
    })
  })
}

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
