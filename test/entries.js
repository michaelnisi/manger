var assert = require('assert')
var common = require('./lib/common')
var fs = require('fs')
var manger = require('../')
var nock = require('nock')
var path = require('path')
var stread = require('stread')
var stream = require('readable-stream')
var test = require('tap').test
var url = require('url')
var zlib = require('zlib')

test('all', function (t) {
  t.plan(8)
  var scope = nock('http://just')
  function setup (zip) {
    var headers = { 'content-type': 'text/xml; charset=UTF-8' }
    if (zip) headers['content-encoding'] = 'gzip'
    scope.get('/b2w').reply(200, function () {
      var p = path.join(__dirname, 'data', 'b2w.xml')
      var file = fs.createReadStream(p)
      if (zip) {
        var gzip = zlib.createGzip()
        return file.pipe(gzip)
      } else {
        return file
      }
    }, headers)
    if (!zip) setup(true)
  }
  function go (times) {
    if (times === 0) return
    var cache = common.freshManger()
    var entries = cache.entries()
    assert(entries instanceof stream.Readable, 'should be Readable')
    var chunks = ''
    entries.on('error', function (er) {
      t.fail('should not ' + er)
    })
    entries.on('data', function (chunk) {
      chunks += chunk
    })
    entries.once('end', function () {
      var found = JSON.parse(chunks)
      t.is(found.length, 150 * 2)
      t.is(cache.counter.itemCount, 1)
      go(--times)
    })
    var uri = 'http://just/b2w'
    t.ok(entries.write(uri))
    t.ok(entries.write(uri), 'should not hit server')
    entries.end()
  }
  setup()
  go(2)
})

test('time range', function (t) {
  t.plan(5)
  var scopes = []
  var headers = { 'content-type': 'text/xml; charset=UTF-8' }
  var strs = ['http://just/b2w', 'http://some/ddc']
  strs.forEach(function (str) {
    var uri = url.parse(str)
    var name = uri.pathname
    var host = 'http://' + uri.host
    scopes.push(nock(host).get(name).reply(200, function () {
      var p = path.join(__dirname, 'data', name + '.xml')
      return fs.createReadStream(p)
    }, headers))
  })
  var db = common.freshDB()
  function go (cb) {
    var entries = new manger.Entries(db)
    var chunks = ''
    entries.on('error', function (er) {
      throw er
    })
    entries.on('data', function (chunk) {
      chunks += chunk
    })
    entries.on('end', function () {
      cb(null, chunks)
    })
    var rawQueries = JSON.stringify([
      { url: 'http://just/b2w',
        since: new Date('Tue, 17 Dec 2013 22:00:00 GMT')
      },
      { url: 'http://some/ddc',
        since: new Date('Fri, 1 Nov 2013 11:29:00 -0700')
      }
    ])
    var queries = manger.queries()
    stread(rawQueries).pipe(queries)
    queries.pipe(entries)
  }
  go(function (er, served) {
    if (er) throw er
    var found = JSON.parse(served)
    t.is(found.length, 1, 'should be exclusive')
    t.is(found[0].title, '23: Morality 2.0')
    scopes.forEach(function (scope) {
      t.ok(scope.isDone())
    })
    go(function (er, cached) {
      if (er) throw er
      t.is(cached, served)
    })
  })
})

test('teardown', function (t) {
  t.ok(!common.teardown())
  t.end()
})
