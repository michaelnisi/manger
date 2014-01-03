
// entries - stream entries

var entries = require('../').entries
  , queries = require('../').queries
  , levelup = require('levelup')
  , assert = require('assert')
  , stread = require('stread')

start(function (er, db) {
  assert(!er && db)
  stread(json())
    .pipe(queries())
    .pipe(entries({ db:db }))
    .pipe(process.stdout)
})

function start (cb) {
  levelup(loc(), null, function (er, db) {
    cb(er, db)
  })
}

function terms () {
  return [
    {
      url:"http://feeds.muleradio.net/thetalkshow"
    , since:Date.UTC(2013, 11)
    }
  , {
      url:"http://5by5.tv/rss"
    , since:Date.UTC(2013, 11)
    }
  ]
}

function json () {
  return JSON.stringify(terms())
}

function loc () {
  return '/tmp/mangerdb'
}
