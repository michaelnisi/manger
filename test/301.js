'use strict'

const StringDecoder = require('string_decoder').StringDecoder
const common = require('./lib/common')
const nock = require('nock')
const test = require('tap').test

const cache = common.freshManger()
const decoder = new StringDecoder('utf8')

const a = 'http://first.ly/feed'
const b = 'http://second.ly/feed'

const scopes = [
  nock('http://first.ly'),
  nock('http://second.ly')
]

test('setup', (t) => {
  const headers = {
    'content-type': 'text/xml; charset=UTF-8',
    'ETag': '55346232-18151',
    'Location': 'http://second.ly/feed'
  }
  scopes[0].get('/feed').reply(301, () => {
  }, headers)
  scopes[1].get('/feed').reply(200, () => {
    return '<rss><channel>' +
      '<item><pubDate>0</pubDate><title>Riley</title></item>' +
      '</channel></rss>'
  })
  scopes[1].get('/feed').reply(200, () => {
    return '<rss><channel>' +
      '<item><pubDate>0</pubDate><title>Riley</title></item>' +
      '<item><pubDate>1</pubDate><title>Sun</title></item>' +
      '</channel></rss>'
  })
  t.end()
})

test('first request', (t) => {
  const s = cache.entries()

  let buf = ''
  s.on('data', (chunk) => {
    buf += chunk
  })

  s.on('end', () => {
    JSON.parse(buf).forEach(({ url, originalURL }) => {
      t.is(originalURL, a)
      t.is(url, b)
    })
    t.end()
  })

  s.end(a)
})

test('list', (t) => {
  const s = cache.list()
  const uris = []
  s.on('data', (uri) => {
    uris.push(uri)
  })
  s.on('end', () => {
    t.is(uris.length, 1)
    t.is(uris[0], b)
    t.end()
  })
})

test('update without flushing first ends', (t) => {
  const s = cache.update()

  s.on('data', (chunk) => { t.fail() })
  s.on('end', () => { t.end() })
})

test('flush counter', (t) => {
  cache.flushCounter((er, count) => {
    if (er) throw er
    t.is(count, 1)
    t.end()
  })
})

test('update', (t) => {
  const s = cache.update()

  let found = []
  s.on('data', (chunk) => {
    found.push(chunk)
  })

  s.on('end', () => {
    t.is(found.length, 1)

    const feed = found[0]
    t.is(feed.url, b)

    t.end()
  })
})

test('updated entries', (t) => {
  const s = cache.entries()

  let buf = ''
  s.on('data', (chunk) => {
    buf += chunk
  })

  s.on('end', () => {
    const entries = JSON.parse(buf)

    t.is(entries.length, 2)

    entries.forEach(({ url, originalURL }) => {
      t.is(originalURL, a)
      t.is(url, b)
    })

    const titles = ['Riley', 'Sun']
    t.same(entries.map(({ title }) => { return title }), titles)

    t.end()
  })

  s.end(a)
})

test('list', (t) => {
  const s = cache.list()
  const uris = []
  s.on('data', (uri) => {
    uris.push(uri)
  })
  s.on('end', () => {
    t.is(uris.length, 1)
    t.is(uris[0], b)
    t.end()
  })
})

test('feeds', (t) => {
  const s = cache.feeds()

  let buf = ''
  s.on('data', (chunk) => {
    buf += chunk
  })

  s.on('end', () => {
    const feeds = JSON.parse(buf)

    t.is(feeds.length, 1)

    const feed = feeds[0]
    t.is(feed.originalURL, a)
    t.is(feed.url, b)

    t.end()
  })

  s.end(a)
})

test('flush counter', (t) => {
  cache.flushCounter((er, count) => {
    if (er) throw er
    t.is(count, 1)
    t.end()
  })
})

test('ranks', (t) => {
  const s = cache.ranks()

  const urls = []
  s.on('data', (chunk) => {
    urls.push(decoder.write(chunk))
  })

  s.on('end', () => {
    t.is(urls.length, 1)

    const url = urls[0]
    t.is(url, b)

    t.end()
  })
})

test('teardown', (t) => {
  scopes.forEach((scope) => { t.ok(scope.isDone()) })
  t.ok(!common.teardown())
  t.end()
})
