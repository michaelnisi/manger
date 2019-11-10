'use strict'

const { test } = require('tap')

const {
  URIFromFeed,
  URIFromRank,
  countFromRank,
  entries,
  entry,
  etag,
  feed,
  rank,
  ranked,
  ranks,
  keyEncoding
} = require('../lib/schema')

const { decode } = keyEncoding

function is (found, wanted, t) {
  for (const it of wanted) {
    t.same(decode(found.shift()), it)
  }

  t.is(found.length, 0)

  return t
}

test('rank', t => {
  t.throws(() => { rank('http://abc.de/') })
  t.throws(() => { rank('http://abc.de/', 'joker') })

  const wanted = [
    ['manger', ['rank', 1, 'http://abc.de/']],
    ['manger', ['rank', 3, 'http://abc.de/']]
  ]

  const found = [
    rank('http://abc.de', 1),
    rank('http://abc.de/', 3)
  ]

  is(found, wanted, t).end()
})

test('count from rank', t => {
  const uri = 'http://abc.de/'

  t.is(countFromRank(rank(uri, 1)), 1)
  t.is(countFromRank(rank(uri, 3)), 3)
  t.end()
})

test('URI from rank', t => {
  const uri = 'http://abc.de/'

  t.is(URIFromRank(rank(uri, 1)), uri)
  t.is(URIFromRank(rank(uri, 3)), uri)
  t.end()
})

test('ranks', t => {
  const { gte, lte } = ranks(50)

  t.is(gte.toString(), 'KJmanger"KJrank"FE  0M0"A!!')
  t.is(lte.toString(), 'KJmanger"KJrank"FF"L!!')
  t.end()
})

test('ranked', t => {
  const uri = 'http://abc.de/'

  t.is(ranked(uri).toString(), 'KJmanger"KJranked"Jhttp://abc.de/!!')
  t.end()
})

test('URI from feed', t => {
  const uri = 'http://abc.de/'

  t.is(URIFromFeed(feed(uri)), uri)
  t.end()
})

test('entry', t => {
  t.throws(() => { entry('http://abc.de/', new Date()) })

  const ts = Date.now()

  const wanted = [
    ['manger', ['entry', 'http://abc.de/', 0, null]],
    ['manger', ['entry', 'http://abc.de/', ts, null]]
  ]

  const found = [
    entry('http://abc.de'),
    entry('http://abc.de/', ts)
  ]

  is(found, wanted, t).end()
})

test('entries', t => {
  const wanted = [
    {
      gt: ['manger', ['entry', 'http://abc.de/', 0, null]],
      lte: ['manger', ['entry', 'http://abc.de/', Infinity, null]],
      fillCache: false
    },
    {
      gt: ['manger', ['entry', 'http://abc.de/', 3600, null]],
      lte: ['manger', ['entry', 'http://abc.de/', Infinity, null]],
      fillCache: true
    }
  ]

  const found = [
    entries('http://abc.de'),
    entries('http://abc.de', 3600, true)
  ]

  t.plan(wanted.length)
  found.forEach(it => {
    const d = {
      gt: decode(it.gt),
      lte: decode(it.lte),
      fillCache: it.fillCache
    }

    t.same(d, wanted.shift())
  })
})

test('etag', t => {
  const wanted = [
    ['manger', ['etag', 'http://abc.de/']],
    ['manger', ['etag', 'http://abc.de/']]
  ]
  const found = [
    etag('http://abc.de'),
    etag('http://abc.de/')
  ]

  is(found, wanted, t).end()
})

test('feed', t => {
  const wanted = [
    ['manger', ['feed', 'http://abc.de/']],
    ['manger', ['feed', 'http://abc.de/']]
  ]
  const found = [
    feed('http://abc.de'),
    feed('http://abc.de/')
  ]

  is(found, wanted, t).end()
})
