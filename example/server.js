
var http = require('http')
  , levelup = require('levelup')
  , path  = require('path')
  , assert = require('assert')
  , fs = require('fs')
  , Store = require('../lib/manger').Store
  , es = require('event-stream')

var dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
  , loc = path.join(dir, 'test.db')
  , opts = {}

fs.mkdirSync(dir, 0700)

levelup(loc, opts, function (er, db) {
  assert(!er && db)
  http.createServer(function (req, res) {
    var tuples = [
      ['troubled.pro/rss.xml', 2013, 10]
    , ['feeds.muleradio.net/allmodcons', 2013]
    ]
    es.readArray(tuples)
      .pipe(new Store(db)).pipe(res)
  }).listen(8765)
})
