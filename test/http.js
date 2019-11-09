'use strict'

const http = require('http')
const path = require('path')
const { Query } = require('../')
const { URL } = require('url')
const { createGzip } = require('zlib')
const { createManger, teardown } = require('./lib/common')
const { createReadStream } = require('fs')
const { test } = require('tap')

function createFileStream (name, gzip = false) {
  const p = path.join(__dirname, 'data', name)
  const f = createReadStream(p)

  if (gzip) {
    const z = createGzip()

    return f.pipe(z)
  }

  return f
}

test('ENOTFOUND', t => {
  const store = createManger()
  const feeds = store.feeds()

  const acc = []

  feeds.on('end', () => {
    const found = Buffer.concat(acc).toString()

    t.is(found, '[]')

    teardown(store, er => {
      if (er) throw er
      t.pass('should teardown')
      t.end()
    })
  })

  feeds.on('readable', () => {
    let chunk
    while ((chunk = feeds.read())) { acc.push(chunk) }
  })

  feeds.on('error', er => {
    t.ok(er)
    t.has(er, { code: 'ENOTFOUND', hostname: 'nowhere', url: 'http://nowhere/' })
  })

  const uri = 'http://nowhere'
  const qry = new Query(uri, null, null, true)

  feeds.end(qry)
})

test('ETag', (t) => {
  t.plan(19)

  const headers = {
    'content-type': 'text/xml; charset=UTF-8',
    ETag: '55346232-18151',
    'content-encoding': 'gzip'
  }
  const diffs = [
    { method: 'GET', code: 200 },
    { method: 'HEAD', code: 200 },
    { method: 'HEAD', code: 304 }
  ]

  const uri = new URL('http://localhost:1337/b2w')

  const fixtures = diffs.map((diff) => {
    return (req, res) => {
      t.is(req.url, uri.pathname, 'should hit correct URL')
      t.is(req.method, diff.method, 'should use expected method')

      res.writeHead(diff.code, headers)

      if (diff.method === 'GET') {
        const wanted = {
          accept: '*/*',
          'accept-encoding': 'gzip',
          host: 'localhost:1337',
          'user-agent': `nodejs/${process.version}`,
          connection: 'close'
        }
        const found = req.headers

        t.same(found, wanted, 'should send required headers')
        createFileStream('b2w.xml', true).pipe(res)
      } else if (diff.method === 'HEAD') {
        const wanted = {
          accept: '*/*',
          'accept-encoding': 'gzip',
          host: 'localhost:1337',
          'if-none-match': '55346232-18151',
          'user-agent': `nodejs/${process.version}`,
          connection: 'close'
        }
        const found = req.headers
        t.same(found, wanted, 'should send required headers')

        // TODO: Test HEAD timeout
        // Not calling end here, leads to a test timeout.

        res.end()
      } else {
        throw new Error('unhandled HTTP method')
      }
    }
  })

  const server = http.createServer((req, res) => {
    fixtures.shift()(req, res)
  }).listen(1337, uri.hostname, (er) => {
    if (er) throw er
    t.pass('should listen on 1337')
    go()
  })

  const store = createManger()

  const go = () => {
    const feeds = store.feeds()

    feeds.on('error', er => { t.fail('should not err: ' + er) })
    let chunk
    let chunks = ''
    feeds.on('readable', () => {
      while ((chunk = feeds.read()) !== null) {
        chunks += chunk
      }
    })
    feeds.on('end', () => {
      const found = JSON.parse(chunks)

      // Forced queries only emit feeds that actually got updated, none in
      // this case.
      t.is(found.length, 2, 'should only emit unforced')

      const first = found[0]
      found.forEach(feed => { t.same(first, feed) })

      server.close((er) => {
        if (er) throw er
        t.pass('should close server')
        teardown(store, (er) => {
          if (er) throw er
          t.pass('should teardown')
        })
      })
    })

    const href = uri.href
    const qry = new Query(href, null, null, true)

    // From the cache perspective, producing miss, hit, miss, miss; resulting
    // in three requests.
    const queries = [href, href, qry, qry]

    queries.forEach(q => { t.ok(feeds.write(q), 'should accept write') })
    feeds.end()
  }
})

test('301 while cached', t => {
  const headers = { 'content-type': 'text/xml; charset=UTF-8' }

  const fixtures = [
    (req, res) => {
      t.is(req.url, '/b2w')

      res.writeHead(200, headers)
      createFileStream('b2w.xml').pipe(res)
    },
    (req, res) => {
      t.is(req.url, '/b2w')

      res.setHeader('Location', 'http://localhost:1337/ddc')
      res.writeHead(301, headers)
      createFileStream('b2w.xml').pipe(res)
    },
    (req, res) => {
      t.is(req.url, '/ddc')

      res.writeHead(200, headers)
      createFileStream('ddc.xml').pipe(res)
    }
  ]

  t.plan(9)

  const server = http.createServer((req, res) => {
    fixtures.shift()(req, res)
  }).listen(1337, 'localhost', (er) => {
    if (er) throw er
    t.pass('should listen on port 1337')

    const cache = createManger()
    const x = Math.random() > 0.5
    const s = x ? cache.feeds() : cache.entries()

    let buf = ''

    s.on('data', (chunk) => {
      buf += chunk
    })
    s.on('end', () => {
      t.is(fixtures.length, 0)
      JSON.parse(buf)

      cache.has('http://localhost:1337/b2w', (er) => {
        t.ok(er, 'should not be cached')
      })
      cache.has('http://localhost:1337/ddc', (er) => {
        if (er) throw er
        t.pass('should be cached')
      })

      server.close((er) => {
        if (er) throw er
        t.pass('should close server')

        teardown(cache, (er) => {
          if (er) throw er
          t.pass('should teardown')
        })
      })
    })
    const uri = 'http://localhost:1337/b2w'
    s.write(uri)
    const q = new Query(uri, null, null, true)
    s.end(q)
  })
})

function done (server, cache, t, cb) {
  server.close((er) => {
    if (er) throw er
    t.pass('should close server')
    if (!cache) return cb ? cb() : null
    teardown(cache, (er) => {
      if (er) throw er
      t.pass('should teardown')
      if (cb) cb()
    })
  })
}

test('HEAD 404', t => {
  const headers = {
    'content-type': 'text/xml; charset=UTF-8',
    ETag: '55346232-18151'
  }

  const fixtures = [
    (req, res) => {
      t.is(req.method, 'GET')
      t.is(req.url, '/b2w.xml')
      res.writeHead(200, headers)
      createFileStream('b2w.xml').pipe(res)
    },
    (req, res) => {
      t.is(req.method, 'HEAD')
      t.is(req.url, '/b2w.xml')
      res.writeHead(304)
      res.end()
    },
    (req, res) => {
      t.is(req.method, 'HEAD')
      t.is(req.url, '/b2w.xml')
      res.writeHead(404)
      res.end()
    },
    // We cannot assume that the remote server is handling HEAD requests
    // correctly, thus we hit it again with a GET before emitting the error.
    (req, res) => {
      t.is(req.method, 'GET')
      t.is(req.url, '/b2w.xml')
      res.writeHead(404)
      res.end()
    }
  ]

  const go = () => {
    const store = createManger()
    const feeds = store.feeds()
    feeds.on('error', er => {
      t.is(er.message, 'quaint HTTP status: 404 from localhost:1337')
    })
    let chunks = ''
    feeds.on('readable', () => {
      let chunk
      while ((chunk = feeds.read()) !== null) {
        chunks += chunk
      }
    })
    feeds.on('end', () => {
      JSON.parse(chunks)
      done(server, store, t)
    })

    const uri = 'http://localhost:1337/b2w.xml'
    t.ok(feeds.write(uri))
    t.ok(feeds.write(uri), 'should be cached')

    const qry = new Query(uri, null, null, true)
    t.ok(feeds.write(qry))
    t.ok(feeds.write(qry))

    feeds.end()
  }

  t.plan(16)

  const server = http.createServer((req, res) => {
    fixtures.shift()(req, res)
  }).listen(1337, (er) => {
    if (er) throw er

    t.pass('should listen on 1337')
    go()
  })
})

test('HEAD ECONNREFUSED', t => {
  const go = () => {
    const store = createManger()
    const feeds = store.feeds()

    feeds.on('error', er => {
      t.is(er.message, 'connect ECONNREFUSED 127.0.0.1:1337')
    })

    let chunks = ''

    feeds.on('readable', () => {
      if (chunks === '') { // first time
        server.close((er) => {
          if (er) throw er
          t.pass('should close server')

          const qry = new Query(uri, null, null, true)

          t.ok(feeds.write(qry))
          feeds.end()
        })
      }

      let chunk
      while ((chunk = feeds.read()) !== null) {
        chunks += chunk
      }
    })

    feeds.on('end', () => {
      JSON.parse(chunks)
      teardown(store, (er) => {
        if (er) throw er
        t.pass('should teardown')
      })
    })

    const uri = 'http://localhost:1337/b2w.xml'

    t.ok(feeds.write(uri))
  }

  t.plan(9)

  const server = http.createServer((req, res) => {
    t.is(req.url, '/b2w.xml')
    t.is(req.method, 'GET')

    const headers = {
      'content-type': 'text/xml; charset=UTF-8',
      ETag: '55346232-18151'
    }

    res.writeHead(200, headers)
    createFileStream('b2w.xml').pipe(res)
  }).listen(1337, (er) => {
    if (er) throw er
    t.pass('should listen on 1337')
    go()
  })
})

test('HEAD socket hangup', t => {
  const go = () => {
    const store = createManger()
    const feeds = store.feeds()

    feeds.on('error', (er) => {
      t.is(er.message, 'socket hang up', 'should err twice')
    })
    feeds.on('end', () => {
      done(server, store, t)
    })

    const uri = 'http://localhost:1337/b2w.xml'

    t.ok(feeds.write(uri), 'should GET')
    t.ok(feeds.write(uri), 'should hit cache')

    const qry = new Query(uri, null, null, true)

    t.ok(feeds.write(qry))

    feeds.end()
    feeds.resume()
  }

  const headers = {
    'content-type': 'text/xml; charset=UTF-8',
    ETag: '55346232-18151'
  }

  const fixtures = [
    (req, res) => {
      t.is(req.method, 'GET')
      t.is(req.url, '/b2w.xml')

      res.writeHead(200, headers)
      createFileStream('b2w.xml').pipe(res)
    },
    (req, res) => {
      t.is(req.method, 'HEAD')
      t.is(req.url, '/b2w.xml')

      res.destroy(new Error('oh shit'))
    },
    (req, res) => {
      t.is(req.method, 'GET')
      t.is(req.url, '/b2w.xml')

      res.destroy(new Error('oh shit'))
    }
  ]

  t.plan(14)

  const server = http.createServer((req, res) => {
    fixtures.shift()(req, res)
  }).listen(1337, (er) => {
    if (er) throw er
    t.pass('should listen on 1337')
    go()
  })
})
