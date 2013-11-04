
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
    var body = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      body += chunk
    })
    req.on('end', function () {
      respond(req, res, db, body)
    })
  }).listen(8765)
})

function end (res) {
  res.writeHead(200)
  res.end('not found\n')
}

function respond (req, res, db, body) {
  var tokens = req.url.split('/')
  tokens.shift()
  var token = tokens.shift()
  var uri = tokens.join('/')
  if (token != 'feeds') {
    end(res)
    return
  }
  var tuple = tupleFromUrl(uri)
  if (tuple) {
    var store = new Store(db)
    store.pipe(res)
    store.write(tuple)
    store.end()
    return
  }
  try {
    var data = JSON.parse(body)
  } catch (er) {
    console.error(er)
    end(res)
    return
  }
  // TODO: combined feeds are not working yet
  es.readArray(data.feeds)
    .pipe(new Store(db))
    .pipe(res)
}
