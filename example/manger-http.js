
// manger-http - serve cached feeds

var http = require('http')
  , levelup = require('levelup')
  , routes = require('routes')()
  , assert = require('assert')
  , bunyan = require('bunyan')
  , manger = require('../')

levelup(loc(), null, start)

function loc () {
  return '/tmp/mangerdb'
}

function log () {
  return bunyan.createLogger({
    name: 'manger-http'
  , streams: [{
      level: 'error',
      path: '/tmp/manger-http.log'
    }]
  })
}

var _opts
function opts (db) {
  if (!_opts) _opts = manger.opts(db, 1 | 2, log())
  return _opts
}

function decorate (req, db) {
  req.opts = opts(db)
  return req
}

function route (req, res) {
  var rt = routes.match(req.url)
    , fn = rt ? rt.fn : null
  if (fn) {
    fn(req, res)
  } else {
    res.writeHead(404)
    res.end('not found\n')
  }
}

function start (er, db) {
  assert(!er)
  routes.addRoute('/feeds', feeds)
  routes.addRoute('/entries', entries)
  routes.addRoute('/update', update)
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

function update (req, res) {
  manger.update(req.opts)
    .pipe(res)
}
