
// server - serve cached feeds

var http = require('http')
  , levelup = require('levelup')
  , routes = require('routes')()
  , assert = require('assert')
  , manger = require('../')

levelup(loc(), null, start)

function loc () {
  return '/tmp/mangerdb'
}

function decorate (req, db) {
  req.opts = manger.opts(db)
  return req
}

function start (er, db) {
  assert(!er)
  routes.addRoute('/feeds', feeds)
  routes.addRoute('/entries', entries)
  http.createServer(function (req, res) {
    route(decorate(req, db), res)
  }).listen(1337)
}

function feeds (req, res) {
  req
    .pipe(manger.queries())
    .pipe(manger.feeds(req.opts))
    .pipe(res)
}

function entries (req, res) {
  req
    .pipe(manger.queries())
    .pipe(manger.entries(req.opts))
    .pipe(res)
}

function route (req, res) {
  var route = routes.match(req.url)
    , fn = route ? route.fn : null
  fn ? fn(req, res) : res.end('go away')
}
