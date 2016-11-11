'use strict'

var manger = require('../')
var stringDecoder = require('string_decoder')
var test = require('tap').test

// TODO: Rename 'misc.js' to something less subtle

test('charset from response', function (t) {
  var f = manger.charsetFromResponse
  function res (str) {
    return {
      headers: {
        'content-type': str
      },
      getHeader: function (name) {
        return this.headers[name]
      }
    }
  }
  var wanted = [
    null,
    null,
    'UTF-8'
  ]
  var found = [
    f(null),
    f({}),
    f(res('text/xml; charset=UTF-8'))
  ]
  t.plan(wanted.length)
  wanted.forEach(function (it) {
    t.is(found.shift(), it)
  })
})

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

test('process query', function (t) {
  var f = manger.processQuery
  var wanted = [
    manger.query('abc'),
    manger.query('abc'),
    manger.query('abc', undefined, undefined, true),
    manger.query('abc', undefined, undefined, true)
  ]
  function Surrogate (force) {
    this.decoder = new stringDecoder.StringDecoder()
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

test('html', function (t) {
  var f = manger.html
  var wanted = [
    null,
    null,
    null,
    '',
    '<h1>Headlines are fine</h1>',
    '<h1>Headline are fine</h1><p>Paragraphs too</p>',
    '<h1>Headline are fine</h1><p>Paragraphs too, but no images</p>',
    'no tables',
    '<br />self closing<br />'
  ]
  var found = [
    f(),
    f(null),
    f(0),
    f(''),
    f('<h1>Headlines are fine</h1>'),
    f('<h1>Headline are fine</h1><p>Paragraphs too</p>'),
    f('<h1>Headline are fine</h1><p>Paragraphs too, <img>but no images</img></p>'),
    f('<table>no tables<table>'),
    f('<br>self closing<br>')
  ]
  t.plan(wanted.length)
  wanted.forEach(function (it) {
    t.same(found.shift(), it)
  })
})
