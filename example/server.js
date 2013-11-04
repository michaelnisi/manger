
var http = require('http')
  , levelup = require('levelup')
  , path  = require('path')
  , assert = require('assert')
  , fs = require('fs')
  , Store = require('../lib/manger').Store
  , es = require('event-stream')
  , tupleFromUrl = require('../lib/manger').tupleFromUrl

var dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
  , loc = path.join(dir, 'test.db')
  , opts = {}

fs.mkdirSync(dir, 0700)

levelup(loc, opts, function (er, db) {
  assert(!er && db)
  http.createServer(function (req, res) {
    var tokens = req.url.split('/')
    tokens.shift()
    var token = tokens.shift()
    var uri = tokens.join('/')
    var tuple = tupleFromUrl(uri)
    if (token != 'feeds' || !tuple) {
      res.writeHead(200)
      res.end('not found\n')
      return
    }
    var store = new Store(db)
    store.pipe(res)
    store.write(tuple)
    store.end()
  }).listen(8765)
})
