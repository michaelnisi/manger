'use strict'

const { createManger, teardown } = require('./lib/common')
const lru = require('lru-cache')
const { allFeedURLs, updateFeedRanking } = require('../lib/ranking')
const { keyEncoding, feed, rank, allRanks } = require('../lib/schema')
const { test } = require('tap')

const { decode } = keyEncoding

class QueryCount {
  constructor (uri, count) {
    this.uri = uri
    this.count = count
  }
}

test('allFeeds', { skip: false }, (t) => {
  const cache = createManger()
  const db = cache.db

  const uris = ['https://abc.de/', 'https://def.de/', 'https://ghi.de/']
  const ops = uris.map(uri => {
    const key = feed(uri)

    return { type: 'put', key: key, value: '{}' }
  })

  t.plan(2)

  db.batch(ops, (er) => {
    if (er) throw er

    allFeedURLs(db, (er, found) => {
      if (er) throw er
      const wanted = uris
      t.same(found, wanted)

      teardown(cache, (er) => {
        if (er) throw er
        t.pass('should teardown')
      })
    })
  })
})

test('rank', (t) => {
  const counts = [
    new QueryCount('https://abc.de/', 3),
    new QueryCount('https://def.de/', 1),
    new QueryCount('https://ghi.de/', 2)
  ]
  const cache = lru()

  counts.forEach(c => { cache.set(c.uri, c.count) })

  const ops = counts.map(c => {
    const key = rank(c.uri, c.count)
    return { type: 'put', key: key, value: c.count }
  })

  const uncounted = ['https://jkl.de/', 'https://mno.de', 'https://pqr.de']

  uncounted.forEach(uri => {
    const key = feed(uri)
    const op = { type: 'put', key: key, value: '{}' }

    ops.push(op)
  })

  const store = createManger()
  const db = store.db

  t.plan(6)

  db.batch(ops, (er) => {
    if (er) throw er
    t.pass('batch applied callback')
    cache.set('https://jkl.de/', 5)

    updateFeedRanking(db, cache, (er, count) => {
      if (er) throw er

      const wanted = [
        ['manger', ['rank', 6, 'https://abc.de/']],
        ['manger', ['rank', 5, 'https://jkl.de/']],
        ['manger', ['rank', 4, 'https://ghi.de/']],
        ['manger', ['rank', 2, 'https://def.de/']],
        ['manger', ['rank', 0, 'https://pqr.de/']],
        ['manger', ['rank', 0, 'https://mno.de/']]
      ]

      t.is(count, wanted.length)
      t.pass('rank applied callback')

      const opts = allRanks
      opts.reverse = true
      const s = db.createKeyStream(opts)
      const found = []

      s.on('data', (chunk) => {
        found.push(decode(chunk))
      })

      s.on('end', () => {
        t.same(found, wanted)

        store.resetRanks(er => {
          if (er) throw er
          t.pass('should reset ranks')

          teardown(store, (er) => {
            if (er) throw er
            t.pass('should teardown')
          })
        })
      })
    })
  })
})
