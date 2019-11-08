'use strict'

// TODO: Reduce timeout

const assert = require('assert')
const common = require('./lib/common')
const debug = require('util').debuglog('manger')
const fs = require('fs')
const http = require('http')
const { Queries } = require('../')
const path = require('path')
const stread = require('stread')
const { pipeline, Writable, Readable, PassThrough } = require('readable-stream')
const url = require('url')
const zlib = require('zlib')
const { test } = require('tap')

test('all', (t) => {
  t.plan(13)

  function setup (acc, zip) {
    const headers = { 'Content-Type': 'text/xml; charset=UTF-8' }
    if (zip) headers['Content-Encoding'] = 'gzip'

    acc.push((req, res) => {
      res.writeHead(200, headers)

      const p = path.join(__dirname, 'data', 'b2w.xml')
      const file = fs.createReadStream(p)
      const x = zip ? zlib.createGzip() : new PassThrough()

      file.pipe(x).pipe(res)
    })

    return zip ? acc : setup(acc, true)
  }

  const fixtures = setup([])
  t.is(fixtures.length, 2)

  const server = http.createServer((req, res) => {
    t.pass()

    fixtures.shift()(req, res)
  }).listen(1337, 'localhost', (er) => {
    if (er) throw er
    t.pass()
  })

  function go (times) {
    if (times === 0) {
      return server.close((er) => {
        if (er) throw er
        t.pass()
      })
    }
    const cache = common.createManger()
    const entries = cache.entries()
    assert(entries instanceof Readable, 'should be Readable')
    let chunks = ''
    entries.on('error', (er) => { throw er })
    entries.on('data', (chunk) => { chunks += chunk })
    entries.once('end', () => {
      const found = JSON.parse(chunks)
      t.is(found.length, 150 * 2)
      t.is(cache.counter.itemCount, 1)
      common.teardown(cache, (er) => {
        if (er) throw er
        go(--times)
      })
    })
    const uri = 'http://localhost:1337/b2w'
    t.ok(entries.write(uri))
    t.ok(entries.write(uri), 'should not hit server')
    entries.end()
  }

  go(2)
})

test('time range', (t) => {
  t.plan(11)

  const origins = ['http://localhost:1337/b2w', 'http://localhost:1338/ddc']
  const headers = { 'Content-Type': 'text/xml; charset=UTF-8' }

  const servers = origins.reduce((acc, origin) => {
    const uri = url.parse(origin)
    const port = uri.port

    const server = http.createServer((req, res) => {
      const name = uri.pathname
      t.is(req.url, name)

      res.writeHead(200, headers)

      const p = path.join(__dirname, 'data', name + '.xml')
      fs.createReadStream(p).pipe(res)
    }).listen(port, (er) => {
      if (er) throw er
      t.pass(`should listen on port ${port}`)
    })

    acc.push(server)

    return acc
  }, [])

  t.is(servers.length, 2)

  const store = common.createManger()

  const go = (cb) => {
    const entries = store.entries()

    let chunks = ''
    entries.on('data', (chunk) => {
      chunks += chunk
    })
    entries.on('end', () => {
      cb(null, chunks)
    })

    const rawQueries = JSON.stringify([
      { url: origins[0],
        since: new Date('Tue, 17 Dec 2013 22:00:00 GMT')
      },
      { url: origins[1],
        since: new Date('Fri, 1 Nov 2013 11:29:00 -0700')
      }
    ])
    const queries = new Queries()
    stread(rawQueries).pipe(queries)
    queries.pipe(entries)
  }

  const handle = (er, chunks, cb) => {
    if (er) throw er
    const found = JSON.parse(chunks)
    found.forEach((entry) => { debug('*** %s', entry.title) })
    t.is(found.length, 1, 'edge cases should be exclusive')
    t.is(found[0].title, '23: Morality 2.0')
    cb()
  }

  // Fresh and cached results should be similar.
  go((er, fresh) => {
    handle(er, fresh, () => {
      go((er, cached) => {
        handle(er, cached, () => {
          common.teardown(store, (er) => {
            if (er) throw er
            servers.forEach((server) => {
              server.close((er) => {
                if (er) throw er
                t.pass('should close server')
              })
            })
          })
        })
      })
    })
  })
})

const read = (entries, uri, cb) => {
  let uris = [uri]
  let chunks = []

  pipeline(
    new Readable({
      read () {
        const chunk = uris.shift() || null
        this.push(chunk)
      }
    }),
    entries,
    new Writable({
      objectMode: true,
      write (chunk, enc, cb) {
        chunks.push(chunk)
        cb()
      }
    }), error => {
      if (error) throw error
      cb(chunks)
    }
  )
}

test('default date', (t) => {
  const origin = 'http://localhost:1337'
  const uri = url.parse(origin)
  const port = uri.port

  t.plan(7)

  const server = http.createServer((req, res) => {
    t.is(req.url, '/planets')
    res.end(`<rss><channel><title>Planets</title>
      <item><title>Mercury</title><guid>123</guid></item>
      </channel></rss>`
    )
  }).listen(port, (er) => {
    if (er) throw er
    t.pass()
  })

  const store = common.createManger({ objectMode: true })

  function go (cb) {
    read(store.entries(), `${origin}/planets`, (entries) => {
      t.is(entries.length, 1)
      const entry = entries[0]
      t.is(entry.updated, 1)
      if (cb) {
        cb()
      } else {
        common.teardown(store, (er) => {
          if (er) throw er
          server.close((er) => {
            if (er) throw er
            t.pass()
          })
        })
      }
    })
  }

  go(go)
})

test('entry updating', t => {
  const origin = 'http://localhost:1337'
  const uri = url.parse(origin)
  const port = uri.port

  function reply (title) {
    return `<rss><channel><title>Planets</title>
      <item><title>Mercury</title><guid>123</guid></item>
      <item><title>${title}</title><guid>456</guid></item>
      </channel></rss>`
  }

  const replies = [reply('Venus'), reply('Earth')]

  const server = http.createServer((req, res) => {
    t.is(req.url, '/planets')
    res.end(replies.shift())
  }).listen(port, (er) => {
    if (er) throw er
    t.pass()
  })

  const store = common.createManger({ objectMode: true })
  const id = `${origin}/planets`

  read(store.entries(), id, (entries) => {
    const wanted = [
      '397a6a82e00ea505e86a2afeaae459969939f1d5',
      'bc8ac87954ac6cc46cf4f382e5fe2eb9ef904c1c'
    ]

    t.same(entries.map(e => e.title), ['Mercury', 'Venus'])
    t.same(entries.map(e => e.id), wanted)

    store.has(id, (er) => {
      if (er) throw er

      store.flushCounter((er) => {
        if (er) throw er

        store.update((error, updated) => {
          if (error) throw error

          read(store.entries(), id, (entries) => {
            t.same(entries.map(e => e.title), ['Mercury', 'Earth'])
            t.same(entries.map(e => e.id), wanted)

            common.teardown(store, (er) => {
              if (er) throw er

              server.close((er) => {
                if (er) throw er
                t.end()
              })
            })
          })
        })
      })
    })
  })
})
