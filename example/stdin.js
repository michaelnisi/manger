
var manger = require('../')
  , levelup = require('levelup')

levelup('/tmp/mangerdb', null, function (er, db) {
  process.stdin
    .pipe(manger(db))
    .on('error', console.error)
    .pipe(process.stdout)
})
