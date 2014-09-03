
var assert = require('assert')
  , common = require('./common')
  , manger = require('../')
  , test = require('tap').test
  ;

test('setup', function (t) {
  common.setup(t)
})

test('constructor', function (t) {
  t.throws(function () { manger() })
  var db = common.db()
  var f = manger({ db:db })
  t.ok(f.opts, 'should have opts')
  t.ok(f.locker, 'should have locker')
  t.same(f.opts.db, db)
  t.is(typeof f, 'object')
  t.is(typeof f.feeds, 'function')
  t.is(typeof f.feeds, 'function')
  t.is(typeof f.entries, 'function')
  t.is(typeof f.update, 'function')
  t.is(typeof f.list, 'function')
  t.end()
})

test('teardown', function (t) {
  common.teardown(t)
})
