
var manger = require('../')
  , levelup = require('levelup')

levelup(loc(), null, function (er, db) {
  process.stdin
    .pipe(manger.queries())
    .pipe(manger.entries(manger.opts(db)))
    .pipe(process.stdout)
})

function loc () {
  return '/tmp/mangerdb'
}
