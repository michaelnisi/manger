'use strict'

const bytewise = require('bytewise')
const schema = require('../lib/schema')
const test = require('tap').test

function is (found, wanted, t) {
  wanted.forEach(function (it) {
    const that = bytewise.decode(found.shift())
    t.same(that, it)
  })
  t.is(found.length, 0)
  return t
}

test('rank', function (t) {
  const f = schema.rank
  t.throws(function () { f('http://abc.de/') })
  t.throws(function () { f('http://abc.de/', 'joker') })
  const wanted = [
    ['manger', ['rank', 1, 'http://abc.de/']],
    ['manger', ['rank', 3, 'http://abc.de/']]
  ]
  const found = [
    f('http://abc.de', 1),
    f('http://abc.de/', 3)
  ]
  is(found, wanted, t).end()
})

test('entry', function (t) {
  const f = schema.entry
  t.throws(function () { f('http://abc.de/', new Date()) })
  const ts = Date.now()
  const wanted = [
    ['manger', ['entry', 'http://abc.de/', 0, null]],
    ['manger', ['entry', 'http://abc.de/', ts, null]]
  ]
  const found = [
    f('http://abc.de'),
    f('http://abc.de/', ts)
  ]
  is(found, wanted, t).end()
})

test('entries', function (t) {
  const f = schema.entries
  const wanted = [
    { gt: ['manger', ['entry', 'http://abc.de/', 0, null]],
      lte: ['manger', ['entry', 'http://abc.de/', Infinity, null]],
      fillCache: false
    },
    { gt: ['manger', ['entry', 'http://abc.de/', 3600, null]],
      lte: ['manger', ['entry', 'http://abc.de/', Infinity, null]],
      fillCache: true
    }
  ]
  const found = [
    f('http://abc.de'),
    f('http://abc.de', 3600, true)
  ]
  t.plan(wanted.length)
  found.forEach(function (it) {
    const d = {
      gt: bytewise.decode(it.gt),
      lte: bytewise.decode(it.lte),
      fillCache: it.fillCache
    }
    t.same(d, wanted.shift())
  })
})

test('etag', function (t) {
  const f = schema.etag
  const wanted = [
    ['manger', ['etag', 'http://abc.de/']],
    ['manger', ['etag', 'http://abc.de/']]
  ]
  const found = [
    f('http://abc.de'),
    f('http://abc.de/')
  ]
  is(found, wanted, t).end()
})

test('feed', function (t) {
  const f = schema.feed
  const wanted = [
    ['manger', ['feed', 'http://abc.de/']],
    ['manger', ['feed', 'http://abc.de/']]
  ]
  const found = [
    f('http://abc.de'),
    f('http://abc.de/')
  ]
  is(found, wanted, t).end()
})
