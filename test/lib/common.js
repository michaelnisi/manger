// common - common test gear

exports.freshDB = freshDB
exports.freshManger = freshManger
exports.teardown = teardown

var assert = require('assert')
var manger = require('../../')
var rimraf = require('rimraf')
var levelup = require('levelup')

function freshName () {
  return '/tmp/fanboy-' + Math.floor(Math.random() * (1 << 24))
}

var db

function freshDB () {
  assert(!teardown())
  var name = freshName()
  db = levelup(name)
  return db
}

function freshManger () {
  assert(!teardown())
  var name = freshName()
  var svc = manger(name)
  db = svc.db
  return svc
}

function teardown () {
  if (db) {
    db.close()
    return rimraf.sync(db.location)
  }
}
