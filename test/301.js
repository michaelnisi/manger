'use strict'

const StringDecoder = require('string_decoder').StringDecoder
const common = require('./lib/common')
const http = require('http')
const t = require('tap')
const test = t.test

const cache = common.freshManger()
const decoder = new StringDecoder()

test('first request', (t) => {
  t.plan(8)

  const a = http.createServer((req, res) => {
    t.pass()

    res.setHeader('ETag', '55346232-18151')
    res.setHeader('Location', 'http://localhost:1338')

    res.writeHead(301, { 'Content-Type': 'text/xml; charset=UTF-8' })
    res.end('ok')
  }).listen(1337, 'localhost', () => {
    t.pass()
  })

  const b = http.createServer((req, res) => {
    t.pass()

    res.writeHead(200, { 'Content-Type': 'text/xml; charset=UTF-8' })
    res.end(`<rss>
              <channel>
                <item>
                  <pubDate>0</pubDate><title>Riley</title>
                </item>
              </channel>
            </rss>`)
  }).listen(1338, 'localhost', () => {
    t.pass()
  })

  const s = cache.entries()

  let buf = ''
  s.on('data', (chunk) => {
    buf += chunk
  })

  s.on('end', () => {
    JSON.parse(buf).forEach(({ url, originalURL }) => {
      // TODO: Remove trailing slashes
      t.is(originalURL, 'http://localhost:1337/')
      t.is(url, 'http://localhost:1338/')
    })

    a.close(() => { t.pass() })
    b.close(() => { t.pass() })
  })

  s.end('http://localhost:1337')
})

test('list', (t) => {
  const s = cache.list()
  const uris = []
  s.on('data', (uri) => {
    uris.push(uri)
  })
  s.on('end', () => {
    t.is(uris.length, 1)
    t.is(uris[0], 'http://localhost:1338/')
    t.end()
  })
})

test('update, without flushing first, ends', (t) => {
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
  t.plan(5)

  const b = http.createServer((req, res) => {
    t.pass()

    res.writeHead(200, { 'Content-Type': 'text/xml; charset=UTF-8' })
    res.end(`<rss>
              <channel>
                <item>
                  <pubDate>0</pubDate><title>Riley</title>
                </item>
                <item>
                  <pubDate>1</pubDate><title>Sun</title>
                </item>
              </channel>
            </rss>`)
  }).listen(1338, 'localhost', () => {
    t.pass()
  })

  const s = cache.update()

  let found = []
  s.on('data', (chunk) => {
    found.push(chunk)
  })

  s.on('end', () => {
    t.is(found.length, 1)

    const feed = found[0]
    t.is(feed.url, 'http://localhost:1338/')

    b.close(() => { t.pass() })
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
      t.is(originalURL, 'http://localhost:1337/')
      t.is(url, 'http://localhost:1338/')
    })

    const titles = ['Riley', 'Sun']
    t.same(entries.map(({ title }) => { return title }), titles)

    t.end()
  })

  s.end('http://localhost:1337')
})

test('list', (t) => {
  const s = cache.list()
  const uris = []
  s.on('data', (uri) => {
    uris.push(uri)
  })
  s.on('end', () => {
    t.is(uris.length, 1)
    t.is(uris[0], 'http://localhost:1338/')
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
    t.is(feed.originalURL, 'http://localhost:1337/')
    t.is(feed.url, 'http://localhost:1338/')

    t.end()
  })

  s.end('http://localhost:1337/')
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
    t.is(url, 'http://localhost:1338/')

    t.end()
  })
})

test('teardown', (t) => {
  common.teardown(cache, (er) => {
    if (er) throw er
    t.end()
  })
})
