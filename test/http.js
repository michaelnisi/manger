'use strict'

// http - test HTTP related things

const StringDecoder = require('string_decoder').StringDecoder
const common = require('./lib/common')
const fs = require('fs')
const manger = require('../')
const nock = require('nock')
const path = require('path')
const test = require('tap').test

test('request error', { skip: false }, t => {
  nock('http://abc.de').get('/').replyWithError('shit happens')

  const store = common.freshManger()
  const feeds = store.feeds()

  let buf = ''
  const dec = new StringDecoder('utf8')
  feeds.on('end', () => {
    const found = dec.write(buf)
    t.is(found, '[]')
  })
  feeds.on('readable', () => {
    let chunk
    while ((chunk = feeds.read())) { buf += chunk }
  })
  feeds.on('error', (er) => {
    t.is(er.message, 'shit happens')
  })

  t.plan(2)

  const uri = 'http://abc.de/'
  const qry = manger.query(uri, null, null, true)
  feeds.end(qry)
})

test('ETag', { skip: false }, (t) => {
  const scope = nock('http://feeds.5by5.tv')
  const headers = {
    'content-type': 'text/xml; charset=UTF-8',
    'ETag': '55346232-18151'
  }
  const mocks = [
    { method: 'GET', code: 200 },
    { method: 'HEAD', code: 200 },
    { method: 'HEAD', code: 304 }
  ]

  mocks.forEach((mock) => {
    const h = (() => {
      if (mock.method === 'GET') {
        return scope.get('/b2w')
      } else if (mock.method === 'HEAD') {
        return scope.head('/b2w')
      } else {
        throw new Error('unhandled HTTP method')
      }
    })()
    h.reply(mock.code, function (req, body) {
      if (mock.method === 'GET') {
        const p = path.join(__dirname, 'data', 'b2w.xml')
        return fs.createReadStream(p)
      } else if (mock.method === 'HEAD') {
        const wanted = {
          'accept': '*/*',
          'accept-encoding': 'gzip',
          'host': 'feeds.5by5.tv',
          'if-none-match': '55346232-18151',
          'user-agent': `nodejs/${process.version}`
        }
        const found = this.req.headers
        t.same(found, wanted)
      } else {
        throw new Error('unhandled HTTP method')
      }
    }, headers)
  })

  const store = common.freshManger()
  const feeds = store.feeds()

  t.plan(10)

  feeds.on('error', er => { t.fail('should not emit ' + er) })
  let chunk
  let chunks = ''
  feeds.on('readable', () => {
    while ((chunk = feeds.read()) !== null) {
      chunks += chunk
    }
  })
  feeds.on('finish', () => {
    const found = JSON.parse(chunks)
    // Forced queries only emit feeds that actually got updated.
    t.is(found.length, 2)
    const first = found[0]
    found.forEach(feed => { t.same(first, feed) })
    t.ok(scope.isDone())
  })
  const uri = 'http://feeds.5by5.tv/b2w'
  const qry = manger.query(uri, null, null, true)
  const queries = [uri, uri, qry, qry]
  queries.forEach(q => { t.ok(feeds.write(q)) })
  feeds.end()
})

test('redirection of cached', { skip: false }, t => {
  const scopes = [
    nock('http://just'),
    nock('http://some')
  ]
  const headers = {
    'content-type': 'text/xml; charset=UTF-8',
    'Location': 'http://some/ddc'
  }
  scopes[0].get('/b2w').reply(200, function () {
    t.pass(200)
    const p = path.join(__dirname, 'data', 'b2w.xml')
    return fs.createReadStream(p)
  }, headers)
  scopes[0].get('/b2w').reply(301, function () {
    t.pass(301)
  }, headers)
  scopes[1].get('/ddc').reply(200, function () {
    t.pass(200)
    const p = path.join(__dirname, 'data', 'ddc.xml')
    return fs.createReadStream(p)
  }, headers)
  const cache = common.freshManger()
  const x = Math.random() > 0.5
  const s = x ? cache.feeds() : cache.entries()

  t.plan(5)

  let buf = ''
  s.on('data', (chunk) => {
    buf += chunk
  })
  s.on('end', () => {
    JSON.parse(buf)
    scopes.forEach(scope => {
      t.ok(scope.isDone(), 'scope should be done')
    })
  })
  const uri = 'http://just/b2w'
  s.write(uri)
  const q = manger.query(uri, null, null, true)
  s.end(q)
})

test('HEAD 404', { skip: false }, t => {
  const scope = nock('http://hello')
  const headers = {
    'content-type': 'text/xml; charset=UTF-8',
    'ETag': '55346232-18151'
  }

  scope.get('/').reply(200, (req, body) => {
    const p = path.join(__dirname, 'data', 'b2w.xml')
    return fs.createReadStream(p)
  }, headers)

  scope.head('/').reply(304)
  scope.head('/').reply(404)

  // We cannot assume that the remote server is handling HEAD requests correctly,
  // therefor we hit it again with a GET before emitting the error.
  scope.get('/').reply(404)

  const store = common.freshManger()
  const feeds = store.feeds()
  feeds.on('error', er => {
    t.is(er.message, 'quaint HTTP status: 404 from hello')
  })
  let chunks = ''
  feeds.on('readable', () => {
    let chunk
    while ((chunk = feeds.read()) !== null) {
      chunks += chunk
    }
  })
  feeds.on('finish', () => {
    JSON.parse(chunks)
    t.ok(scope.isDone())
  })

  t.plan(6)

  const uri = 'http://hello/'
  t.ok(feeds.write(uri))
  t.ok(feeds.write(uri), 'should be cached')

  const qry = manger.query(uri, null, null, true)
  t.ok(feeds.write(qry))
  t.ok(feeds.write(qry))

  feeds.end()
})

test('HEAD not found', { skip: false }, t => {
  const scope = nock('http://hello')
  const headers = {
    'content-type': 'text/xml; charset=UTF-8',
    'ETag': '55346232-18151'
  }

  scope.get('/').reply(200, (req, body) => {
    nock.cleanAll()
    const p = path.join(__dirname, 'data', 'b2w.xml')
    return fs.createReadStream(p)
  }, headers)

  const store = common.freshManger()
  const feeds = store.feeds()
  feeds.on('error', er => {
    t.is(er.message, 'getaddrinfo ENOTFOUND hello hello:80')
  })
  let chunks = ''
  feeds.on('readable', () => {
    let chunk
    while ((chunk = feeds.read()) !== null) {
      chunks += chunk
    }
  })
  feeds.on('finish', () => {
    JSON.parse(chunks)
    t.ok(scope.isDone())
  })

  t.plan(4)

  const uri = 'http://hello/'
  t.ok(feeds.write(uri))

  const qry = manger.query(uri, null, null, true)
  t.ok(feeds.write(qry))

  feeds.end()
})

test('HEAD request error during update', { skip: false }, t => {
  const scope = nock('http://hello')
  const headers = {
    'content-type': 'text/xml; charset=UTF-8',
    'ETag': '55346232-18151'
  }

  const p = path.join(__dirname, 'data', 'b2w.xml')
  scope.get('/').replyWithFile(200, p, headers)
  scope.head('/').replyWithError('oh shit')
  scope.get('/').replyWithError('oh shit')

  const store = common.freshManger()

  const feeds = store.feeds()
  feeds.on('error', (er) => { t.is(er.message, 'oh shit', 'should err twice') })
  feeds.on('end', () => { t.ok(scope.isDone()) })

  t.plan(6)

  const uri = 'http://hello/'
  t.ok(feeds.write(uri), 'should GET')
  t.ok(feeds.write(uri), 'should hit cache')

  const qry = manger.query(uri, null, null, true)
  t.ok(feeds.write(qry))

  feeds.end()
  feeds.resume()
})

test('teardown', t => {
  t.ok(!common.teardown())
  t.end()
})
