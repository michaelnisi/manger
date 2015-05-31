var manger = require('../')
var string_decoder = require('string_decoder')
var test = require('tap').test

test('redirect', function (t) {
  var f = manger.redirect
  var wanted = [
    false,
    true,
    true,
    false
  ]
  var found = [
    f(200),
    f(300),
    f(399),
    f(400)
  ]
  t.plan(wanted.length)
  wanted.forEach(function (it) {
    t.is(found.shift(), it)
  })
})

test('failure keys', function (t) {
  var f = manger.failureKey
  t.throws(function () { f() })
  t.throws(function () { f(null) })
  t.throws(function () { f(123) })
  t.throws(function () { f('GET', 123) })
  t.is(f('HEAD', 'http://abc.de/'), 'HEAD-http://abc.de/')
  t.end()
})

test('compare etags', function (t) {
  var f = manger.sameEtag
  var wanted = [
    false,
    false,
    false,
    true
  ]
  var found = [
    f({}, { headers: {} }),
    f({ etag: '123' }, { headers: {} }),
    f({}, { headers: { etag: '123' } }),
    f({ etag: '123' }, { headers: { etag: '123' } })
  ]
  t.plan(wanted.length)
  wanted.forEach(function (it) {
    t.is(found.shift(), it)
  })
})

test('headers in rough strokes', function (t) {
  var f = manger.processHeaders
  var H = manger.Headers
  function error (sc) {
    var er = new Error('unhandled HTTP status code ' + sc)
    return er
  }
  var wanted = [
    new H(error(100), false),
    new H(undefined, true),
    new H(undefined, false),
    new H(error(400), false),
    new H(error(500), false)
  ]
  var found = [
    f({}, { headers: {}, statusCode: 100 }),
    f({}, { headers: {}, statusCode: 200 }),
    f({}, { headers: {}, statusCode: 300 }),
    f({}, { headers: {}, statusCode: 400 }),
    f({}, { headers: {}, statusCode: 500 })
  ]
  t.plan(wanted.length)
  wanted.forEach(function (it) {
    t.deepEqual(found.shift(), it)
  })
})

test('process query', function (t) {
  var f = manger.processQuery
  var wanted = [
    manger.query('abc'),
    manger.query('abc'),
    manger.query('abc', undefined, undefined, true),
    manger.query('abc', undefined, undefined, true)
  ]
  function Surrogate (force) {
    this.decoder = new string_decoder.StringDecoder()
    this.force = force || false
  }
  var m = new Surrogate()
  var mf = new Surrogate(true)
  var found = [
    f(m, 'abc'),
    f(m, new Buffer('abc')),
    f(mf, 'abc'),
    f(mf, new Buffer('abc'))
  ]
  t.plan(wanted.length)
  wanted.forEach(function (it) {
    t.same(found.shift(), it)
  })
})

test('newer', function (t) {
  var f = manger.newer
  var wanted = [
    true,
    true,
    false
  ]
  function item (time) {
    return { updated: time }
  }
  function query (time) {
    return { since: time }
  }
  var found = [
    f(item(0), query(0)),
    f(item(1), query(0)),
    f(item(1), query(1))
  ]
  t.plan(wanted.length)
  wanted.forEach(function (it) {
    t.same(found.shift(), it)
  })
})
