'use strict'

var bytewise = require('bytewise')
var common = require('./lib/common')
var schema = require('../lib/schema')
var test = require('tap').test

function is (found, wanted, t) {
  wanted.forEach(function (it) {
    var that = bytewise.decode(found.shift())
    t.same(that, it)
  })
  t.is(found.length, 0)
  return t
}

test('rank', function (t) {
  var f = schema.rank
  t.throws(function () { f('http://abc.de/') })
  t.throws(function () { f('http://abc.de/', 'joker') })
  var wanted = [
    ['manger', ['rank', 1, 'http://abc.de/']],
    ['manger', ['rank', 3, 'http://abc.de/']]
  ]
  var found = [
    f('http://abc.de', 1),
    f('http://abc.de/', 3)
  ]
  is(found, wanted, t).end()
})

test('entry', function (t) {
  var f = schema.entry
  t.throws(function () { f('http://abc.de/', new Date()) })
  var ts = Date.now()
  var wanted = [
    ['manger', ['entry', 'http://abc.de/', 0]],
    ['manger', ['entry', 'http://abc.de/', ts]]
  ]
  var found = [
    f('http://abc.de'),
    f('http://abc.de/', ts)
  ]
  is(found, wanted, t).end()
})

test('entries', function (t) {
  var f = schema.entries
  var wanted = [
    { gt: ['manger', ['entry', 'http://abc.de/', 0]],
      lte: ['manger', ['entry', 'http://abc.de/', Infinity]],
      fillCache: false
    },
    { gt: ['manger', ['entry', 'http://abc.de/', 3600]],
      lte: ['manger', ['entry', 'http://abc.de/', Infinity]],
      fillCache: true
    }
  ]
  var found = [
    f('http://abc.de'),
    f('http://abc.de', 3600, true)
  ]
  t.plan(wanted.length)
  found.forEach(function (it) {
    var d = {
      gt: bytewise.decode(it.gt),
      lte: bytewise.decode(it.lte),
      fillCache: it.fillCache
    }
    t.same(d, wanted.shift())
  })
})

test('etag', function (t) {
  var f = schema.etag
  var wanted = [
    ['manger', ['etag', 'http://abc.de/']],
    ['manger', ['etag', 'http://abc.de/']]
  ]
  var found = [
    f('http://abc.de'),
    f('http://abc.de/')
  ]
  is(found, wanted, t).end()
})

test('feed', function (t) {
  var f = schema.feed
  var wanted = [
    ['manger', ['feed', 'http://abc.de/']],
    ['manger', ['feed', 'http://abc.de/']]
  ]
  var found = [
    f('http://abc.de'),
    f('http://abc.de/')
  ]
  is(found, wanted, t).end()
})

test('teardown', function (t) {
  t.ok(!common.teardown())
  t.end()
})
