'use strict'

const StringDecoder = require('string_decoder').StringDecoder
const common = require('./lib/common')
const http = require('http')
const test = require('tap').test
const { URL } = require('url')

const cache = common.createManger()
const decoder = new StringDecoder('utf8')

const a = new URL('http://localhost:1337/a')
const b = new URL('http://localhost:1337/b')

test('first request', (t) => {
  t.plan(8)

  const fixtures = [
    (req, res) => {
      t.is(req.url, a.pathname)

      res.setHeader('ETag', '55346232-18151')
      res.setHeader('Location', b.href)

      res.writeHead(302, { 'Content-Type': 'text/xml; charset=UTF-8' })
      res.end('ok')
    },
    (req, res) => {
      t.is(req.url, b.pathname)

      res.writeHead(200, { 'Content-Type': 'text/xml; charset=UTF-8' })
      res.end(`<rss>
                <channel>
                  <item>
                    <pubDate>0</pubDate><title>Riley</title>
                  </item>
                </channel>
              </rss>`)
    },
    (req, res) => {
      t.is(req.url, b.pathname)

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
    }
  ]

  const server = http.createServer((req, res) => {
    t.pass()

    fixtures.shift()(req, res)
  }).listen(a.port, a.hostname, (er) => {
    if (er) throw er
    t.pass()
  })

  const s = cache.entries()

  let buf = ''
  s.on('data', (chunk) => {
    buf += chunk
  })

  s.on('end', () => {
    JSON.parse(buf).forEach(({ url, originalURL }) => {
      t.is(originalURL, a.href)
      t.is(url, a.href)
    })

    server.close((er) => {
      if (er) throw er
      t.pass()
    })
  })

  s.end(a.href)
})

test('list', (t) => {
  const s = cache.list()
  const uris = []
  s.on('data', (uri) => {
    uris.push(uri)
  })
  s.on('end', () => {
    t.is(uris.length, 1)
    t.is(uris[0], a.href)
    t.end()
  })
})

test('update, without flushing first, ends', (t) => {
  cache.update((error, uris) => {
    if (error) throw error
    t.is(uris.length, 0)
    t.end()
  })
})

test('flush counter', (t) => {
  cache.flushCounter((er, count) => {
    if (er) throw er
    t.is(count, 1)
    t.end()
  })
})

test('update', (t) => {
  t.plan(6)

  const server = http.createServer((req, res) => {
    t.is(req.url, b.pathname)

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
  }).listen(a.port, a.hostname, (er) => {
    if (er) throw er
    t.pass()
  })

  cache.update((error, uris) => {
    if (error) throw error

    t.is(uris.length, 1)

    const feed = uris[0]

    t.is(feed.url, a.href)
    t.is(feed.originalURL, a.href)

    server.close((er) => {
      if (er) throw er
      t.pass()
    })
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
      t.is(url, a.href)
      t.is(originalURL, a.href)
    })

    const titles = ['Riley', 'Sun']
    t.same(entries.map(({ title }) => { return title }), titles)

    t.end()
  })

  s.end(a.href)
})

test('list', (t) => {
  const s = cache.list()
  const uris = []
  s.on('data', (uri) => {
    uris.push(uri)
  })
  s.on('end', () => {
    t.is(uris.length, 1)
    t.is(uris[0], a.href)
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
    t.is(feed.url, a.href)
    t.is(feed.originalURL, a.href)

    t.end()
  })

  s.end(a.href)
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
    t.is(url, a.href)

    t.end()
  })
})

test('teardown', (t) => {
  common.teardown(cache, (er) => {
    if (er) throw er
    t.end()
  })
})
