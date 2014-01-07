
var manger = require('../')
  , levelup = require('levelup')
  , assert = require('assert')

start(function (er, db) {
  assert(!er && db)
  process.stdin
    .pipe(manger.queries())
    .pipe(manger.entries(manger.opts(db)))
    .pipe(process.stdout)
})

function start (cb) {
  levelup(loc(), null, function (er, db) {
    cb(er, db)
  })
}

function loc () {
  return '/tmp/mangerdb'
}
