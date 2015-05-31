var common = require('./lib/common')
var fs = require('fs')
var lino = require('lino')
var nock = require('nock')
var path = require('path')
var stream = require('readable-stream')
var test = require('tap').test
var url = require('url')

test('not modified', function (t) {
  t.plan(7)
  var setup = new stream.Transform()
  var headers = {
    'content-type': 'application/json',
    'ETag': '55346232-18151'
  }
  var scopes = []
  setup._transform = function (chunk, enc, cb) {
    var uri = url.parse('' + chunk)
    var u = uri.protocol + '//' + uri.host
    var scope = nock(u)
    scopes.push(scope)
    var route = '/' + path.basename(url.format(uri))
    var filename = route + '.xml'
    scope.get(route).reply(200, function () {
      var p = path.join(__dirname, 'data', filename)
      return fs.createReadStream(p)
    }, headers)
    scope.head(route).reply(304, null, headers)
    setup.push(chunk)
    cb()
  }
  var store = common.freshManger()
  var feeds = store.feeds()
  var p = path.join(__dirname, 'data', 'ALL')
  var input = fs.createReadStream(p)
  function update () {
    var updated = store.update()
    var chunks = ''
    updated.on('data', function (chunk) {
      chunks += chunk
    })
    updated.on('end', function () {
      t.same(JSON.parse(chunks), [])
      scopes.forEach(function (scope) {
        t.ok(scope.isDone())
      })
    })
  }
  feeds.on('finish', function () {
    store.flushCounter(function (er) {
      t.is(er, undefined)
      update()
    })
  })
  input.pipe(lino()).pipe(setup).pipe(feeds).resume()
})

test('teardown', function (t) {
  t.ok(!common.teardown())
  t.end()
})
