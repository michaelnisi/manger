
// feeds - query cache for feeds

var resumer = require('resumer')
  , feeds = require('../').feeds
  , time = require('../').time
  , path = require('path')
  , fs = require('fs')
  , levelup = require('levelup')

;(setup(function (er, db) {
  print(json(queries()), db)
}))()

function print (json, db) {
  resumer().queue(json)
    .pipe(feeds(db))
    .pipe(process.stdout)
}

function queries () {
  return [
    { url:'http://5by5.tv/rss', time:time(2013, 11, 11) }
  ]
}

// Details

function setup (cb) {
  var dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
    , loc = path.join(dir, 'test.db')
    , opts = {}
  fs.mkdirSync(dir, 0700)
  levelup(loc, opts, function (er, db) {
    cb(er, db)
  })
}

function json (data) {
  return JSON.stringify(data)
}
