'use strict'

const assert = require('assert')
const common = require('./lib/common')
const debug = require('util').debuglog('manger')
const fs = require('fs')
const manger = require('../')
const nock = require('nock')
const path = require('path')
const stread = require('stread')
const stream = require('readable-stream')
const test = require('tap').test
const url = require('url')
const zlib = require('zlib')

test('all', { skip: false }, (t) => {
  t.plan(8)

  const scope = nock('http://just')

  function setup (zip) {
    const headers = { 'content-type': 'text/xml; charset=UTF-8' }
    if (zip) headers['content-encoding'] = 'gzip'
    scope.get('/b2w').reply(200, () => {
      const p = path.join(__dirname, 'data', 'b2w.xml')
      const file = fs.createReadStream(p)
      if (zip) {
        const gzip = zlib.createGzip()
        return file.pipe(gzip)
      } else {
        return file
      }
    }, headers)
    if (!zip) setup(true)
  }

  function go (times) {
    if (times === 0) return
    const cache = common.freshManger()
    const entries = cache.entries()
    assert(entries instanceof stream.Readable, 'should be Readable')
    let chunks = ''
    entries.on('error', (er) => { t.fail('should not ' + er) })
    entries.on('data', (chunk) => { chunks += chunk })
    entries.once('end', () => {
      const found = JSON.parse(chunks)
      t.is(found.length, 150 * 2)
      t.is(cache.counter.itemCount, 1)
      go(--times)
    })
    const uri = 'http://just/b2w'
    t.ok(entries.write(uri))
    t.ok(entries.write(uri), 'should not hit server')
    entries.end()
  }

  setup()
  go(2)
})

test('time range', { skip: false }, (t) => {
  const origins = ['http://just/b2w', 'http://some/ddc']
  const headers = { 'content-type': 'text/xml; charset=UTF-8' }

  const scopes = []

  origins.forEach((origin) => {
    const uri = url.parse(origin)
    const name = uri.pathname
    const host = 'http://' + uri.host

    scopes.push(nock(host).get(name).reply(200, () => {
      const p = path.join(__dirname, 'data', name + '.xml')
      return fs.createReadStream(p)
    }, headers))
  })

  const store = common.freshManger()

  function go (cb) {
    const entries = store.entries()

    let chunks = ''
    entries.on('data', (chunk) => { chunks += chunk })
    entries.on('end', () => { cb(null, chunks) })

    // TODO: Investigate edge cases

    const rawQueries = JSON.stringify([
      { url: 'http://just/b2w',
        since: new Date('Tue, 17 Dec 2013 22:00:00 GMT')
      },
      { url: 'http://some/ddc',
        since: new Date('Fri, 1 Nov 2013 11:29:00 -0700')
      }
    ])
    const queries = manger.queries()
    stread(rawQueries).pipe(queries)
    queries.pipe(entries)
  }

  function handle (er, chunks, cb) {
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
          scopes.forEach((scope) => {
            t.ok(scope.isDone())
          })
          t.end()
        })
      })
    })
  })
})

function read (entries, uri, cb) {
  const found = []
  entries.on('finish', () => {
    cb(found)
  })
  entries.on('readable', () => {
    let entry = null
    while ((entry = entries.read()) !== null) {
      found.push(entry)
    }
  })
  entries.end(uri)
}

test('default date', { skip: false }, (t) => {
  const origin = 'http://feeds.5by5.tv'
  const scope = nock(origin)

  scope.get('/b2w').reply(200, (req, body) => {
    return [
      '<rss><channel><title>Planets</title>',
      '<item><title>Mercury</title><guid>123</guid></item>',
      '</channel></rss>'
    ].join('')
  })

  const store = common.freshManger({ objectMode: true })
  const uri = `${origin}/b2w`

  function go (cb) {
    read(store.entries(), uri, (entries) => {
      t.is(entries.length, 1)
      const entry = entries[0]
      t.is(entry.updated, 1)
      t.ok(scope.isDone())
      cb ? cb() : t.end()
    })
  }

  go(go)
})

test('entry updating', { skip: false }, (t) => {
  const origin = 'http://feeds.5by5.tv'
  const scope = nock(origin)

  function reply (title) {
    scope.get('/b2w').reply(200, (req, body) => {
      return [
        '<rss><channel><title>Planets</title>',
        '<item><title>Mercury</title><guid>123</guid></item>',
        `<item><title>${title}</title><guid>456</guid></item>`,
        '</channel></rss>'
      ].join('')
    })
  }

  reply('Venus')
  reply('Earth')

  const store = common.freshManger({ objectMode: true })
  const uri = `${origin}/b2w`

  read(store.entries(), uri, (entries) => {
    const titles = (es) => { return es.map((e) => { return e.title }) }
    const ids = (es) => { return es.map((e) => { return e.id }) }

    t.same(titles(entries), ['Mercury', 'Venus'])
    t.same(ids(entries), [
      '5d1f67733a85925f1ad4ef0100276daabef0e412',
      '80f78b85676487ec1fea35e957b2d091cb2287cb'
    ])

    store.has(uri, (er) => {
      if (er) throw er
      store.flushCounter((er) => {
        if (er) throw er
        const update = store.update()
        update.on('end', () => {
          read(store.entries(), uri, (entries) => {
            t.same(titles(entries), ['Mercury', 'Earth'])
            t.same(ids(entries), [
              '5d1f67733a85925f1ad4ef0100276daabef0e412',
              '80f78b85676487ec1fea35e957b2d091cb2287cb'
            ])
            t.ok(scope.isDone())
            t.end()
          })
        })
        update.resume()
      })
    })
  })
})

test('teardown', (t) => {
  t.ok(!common.teardown())
  t.end()
})
