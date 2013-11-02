
var http = require('http')
  , manger = require('../')
  , levelup = require('levelup')
  , path  = require('path')
  , assert = require('assert')
  , fs = require('fs')

var dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
  , loc = path.join(dir, 'test.db')
  , opts = {}

fs.mkdirSync(dir, 0700)

levelup(loc, opts, function (er, db) {
  assert(!er && db)
  http.createServer(function (req, res) {
    if (req.method === 'POST') {
      var opts = {}
      opts.db = db
      req.pipe(manger(opts)).pipe(res)
    } else {
      res.writeHead(200)
      res.end('not yet\n')
    }
  }).listen(8765)
})
