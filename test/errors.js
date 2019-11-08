'use strict'

const common = require('./lib/common')
const test = require('tap').test

test('queries and requests', (t) => {
  function go (s, t, cb) {
    const found = []
    s.on('error', (er) => {
      found.push(er)
    })

    let buf = ''
    s.on('readable', () => {
      let chunk
      while ((chunk = s.read()) !== null) { buf += chunk }
    })
    // Failed requests are cached, an error is emitted only for the first
    // failure per URL. Invalid queries do not produce requests, so errors
    // are emitted for each of those.
    const wanted = [
      'invalid query',
      'getaddrinfo ENOTFOUND',
      'invalid query',
      'invalid protocol'
    ]
    s.on('finish', () => {
      t.same(JSON.parse(buf), [])
      t.is(found.length, wanted.length)
      wanted.forEach((it) => {
        t.ok(found.shift().message.match(new RegExp(it)))
      })
      cb()
    })

    t.ok(s.write('abc'))
    t.ok(s.write('http://def'))
    t.ok(s.write('ghi'))
    t.ok(s.write('feed://abc'))
    t.ok(s.write('http://def'))
    s.end()
  }

  t.plan(2, 'same tests for feeds and entries')

  const teardown = (t, cache) => {
    return (er) => {
      if (er) throw er
      common.teardown(cache, (er) => {
        if (er) throw er
        t.end()
      })
    }
  }

  t.test('feeds', (t) => {
    const cache = common.createManger()
    const feeds = cache.feeds()
    go(feeds, t, teardown(t, cache))
  })

  t.test('entries', (t) => {
    const cache = common.createManger()
    const entries = cache.entries()
    go(entries, t, teardown(t, cache))
  })
})
