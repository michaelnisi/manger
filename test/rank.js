'use strict'

const common = require('./lib/common')
const bytewise = require('bytewise')
const lru = require('lru-cache')
const rank = require('../lib/rank')
const schema = require('../lib/schema')
const test = require('tap').test

function QueryCount (uri, count) {
  if (!(this instanceof QueryCount)) return new QueryCount(uri, count)

  this.uri = uri
  this.count = count
}

test('allFeeds', { skip: false }, (t) => {
  const cache = common.createManger()
  const db = cache.db

  const uris = ['abc', 'def', 'ghi']
  const ops = uris.map(uri => {
    const key = schema.feed(uri)

    return { type: 'put', key: key, value: '{}' }
  })

  t.plan(2)

  db.batch(ops, (er) => {
    if (er) throw er

    const f = rank.allFeeds

    f(db, (er, found) => {
      if (er) throw er
      const wanted = uris
      t.same(found, wanted)

      common.teardown(cache, (er) => {
        if (er) throw er
        t.pass('should teardown')
      })
    })
  })
})

test('rank', (t) => {
  const counts = [
    QueryCount('abc', 3),
    QueryCount('def', 1),
    QueryCount('ghi', 2)
  ]
  const cache = lru()

  counts.forEach(c => { cache.set(c.uri, c.count) })

  const ops = counts.map(c => {
    const key = schema.rank(c.uri, c.count)
    return { type: 'put', key: key, value: c.count }
  })

  const uncounted = ['jkl', 'mno', 'pqr']

  uncounted.forEach(uri => {
    const key = schema.feed(uri)
    const op = { type: 'put', key: key, value: '{}' }

    ops.push(op)
  })

  const store = common.createManger()
  const db = store.db

  t.plan(6)

  db.batch(ops, (er) => {
    if (er) throw er
    t.pass('batch applied callback')
    cache.set('jkl', 5)

    rank(db, cache, (er, count) => {
      if (er) throw er

      const wanted = [
        ['manger', ['rank', 6, 'abc']],
        ['manger', ['rank', 5, 'jkl']],
        ['manger', ['rank', 4, 'ghi']],
        ['manger', ['rank', 2, 'def']],
        ['manger', ['rank', 0, 'pqr']],
        ['manger', ['rank', 0, 'mno']]
      ]

      t.is(count, wanted.length)
      t.pass('rank applied callback')

      const opts = schema.allRanks
      opts.reverse = true
      const s = db.createKeyStream(opts)
      const found = []

      s.on('data', (chunk) => {
        found.push(bytewise.decode(chunk))
      })

      s.on('end', () => {
        t.same(found, wanted)

        store.resetRanks(er => {
          if (er) throw er
          t.pass('should reset ranks')

          common.teardown(store, (er) => {
            if (er) throw er
            t.pass('should teardown')
          })
        })
      })
    })
  })
})
