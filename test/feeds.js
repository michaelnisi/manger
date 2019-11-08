'use strict'

const assert = require('assert')
const common = require('./lib/common')
const http = require('http')
const stream = require('readable-stream')
const test = require('tap').test

test('plain feed caching', (t) => {
  t.plan(9, 'second request should not hit server')

  const server = http.createServer((req, res) => {
    t.is(req.url, '/b2w', 'should hit correct URL')

    res.setHeader('ETag', '55346232-18151')
    res.writeHead(200, { 'Content-Type': 'text/xml; charset=UTF-8' })

    res.end(`<rss><channel></channel></rss>`)
  }).listen(1337, 'localhost', (er) => {
    if (er) throw er
    t.pass('should listen in 1337')

    const cache = common.createManger()
    const feeds = cache.feeds()
    assert(feeds instanceof stream.Readable, 'should be Readable')

    const uri = 'http://localhost:1337/b2w'

    let chunks = ''
    feeds.on('data', (chunk) => { chunks += chunk })
    feeds.on('end', () => {
      const feeds = JSON.parse(chunks)
      feeds.forEach((feed) => {
        t.is(feed.url, uri)
      })
      t.pass('should end')
      server.close((er) => {
        if (er) throw er
        t.pass('should close server')
        common.teardown(cache, (er) => {
          if (er) throw er
          t.pass('should teardown')
        })
      })
    })

    t.ok(feeds.write(uri))
    t.ok(feeds.write(uri))
    feeds.end()
  })
})
