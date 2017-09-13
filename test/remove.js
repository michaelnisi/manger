'use strict'

const common = require('./lib/common')
const fs = require('fs')
const http = require('http')
const path = require('path')
const test = require('tap').test

const cache = common.freshManger()

test('setup', (t) => {
  t.plan(4)

  const go = () => {
    const feeds = cache.feeds()

    let buf = ''
    feeds.on('data', function (chunk) {
      buf += chunk
    })
    feeds.on('end', function () {
      JSON.parse(buf)
      t.pass('feed cached')

      server.close((er) => {
        if (er) throw er
        t.pass('should close server')
      })
    })
    feeds.end('http://localhost:1337/b2w')
  }

  const server = http.createServer((req, res) => {
    t.is(req.url, '/b2w')

    const headers = {
      'content-type': 'text/xml; charset=UTF-8',
      'ETAG': '55346232-18151'
    }

    res.writeHead(200, headers)

    const p = path.join(__dirname, 'data', 'b2w.xml')
    fs.createReadStream(p).pipe(res)
  }).listen(1337, (er) => {
    if (er) throw er
    t.pass('should listen on 1337')
    go()
  })
})

test('rank', t => {
  const feeds = cache.feeds()
  const uri = 'http://localhost:1337/b2w'
  feeds.end(uri)
  feeds.on('end', () => {
    cache.flushCounter(er => {
      if (er) throw er
      const ranks = cache.ranks()
      let found = ''
      ranks.on('data', chunk => { found += chunk })
      ranks.on('end', () => {
        t.is(found, uri)
        t.end()
      })
    })
  })
  feeds.resume()
})

test('remove', t => {
  t.plan(3)
  const uri = 'http://localhost:1337/b2w'

  cache.has(uri, er => {
    if (er) throw er
    cache.remove(uri, er => {
      if (er) throw er
      cache.has(uri, er => { t.ok(er.notFound) })

      cache.db.createKeyStream()
        .on('data', chunk => { t.fail() })
        .on('end', () => { t.pass('should be empty') })

      const ranks = cache.ranks()
      let found = ''
      ranks.on('data', chunk => { found += chunk })
      ranks.on('end', () => {
        t.is(found, '')
      })
    })
  })
})

test('teardown', t => {
  common.teardown(cache, (er) => {
    if (er) throw er
    t.end()
  })
})
