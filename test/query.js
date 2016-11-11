'use strict'

const fs = require('fs')
const query = require('../lib/query')
const lino = require('lino')
const test = require('tap').test
const path = require('path')
const stread = require('stread')

test('trim', (t) => {
  const f = query.trim
  t.is(typeof f, 'function')
  const strs = [
    '',
    null,
    'abc',
    'http://abc',
    ' http://abc ',
    'https://abc',
    ' https://abc '
  ]
  const wanted = [
    null,
    null,
    null,
    'http://abc/',
    'http://abc/',
    'https://abc/',
    'https://abc/'
  ]
  strs.forEach((str, i) => { t.is(f(str), wanted[i]) })
  t.plan(wanted.length + 1)
})

test('query', (t) => {
  const f = query
  const found = [
    f('http://5by5.tv/a'),
    f('http://5by5.tv/b\n', 'Thu Jan 01 1970 01:00:00 GMT+0100 (CET)'),
    f(' http://5by5.tv/c ', '1970-01-01'),
    f(' 5by5.tv/d '),
    f('http://'),
    f('feed://5by5.tv/f'),
    f('localhost'),
    f('https://5by5.tv/h')
  ]
  const wanted = [
    f('http://5by5.tv/a', 0),
    f('http://5by5.tv/b', 0),
    f('http://5by5.tv/c', 0),
    null,
    null,
    f('feed://5by5.tv/f', 0),
    null,
    f('https://5by5.tv/h', 0)
  ]
  t.plan(wanted.length)
  wanted.forEach((it, i) => {
    t.deepEquals(found.shift(), it)
  })
})

test('request', (t) => {
  const f = query
  const found = [
    f('http://abc.def/ghi.jkl').request(),
    f('http://abc.def/ghi.jkl', null, '123').request(),
    f('https://abc.def/ghi.jkl').request()
  ]
  const headers = {
    'accept': '*/*',
    'accept-encoding': 'gzip',
    'user-agent': `nodejs/${process.version}`
  }
  const wanted = [
    { hostname: 'abc.def',
      port: 80,
      path: '/ghi.jkl',
      method: 'GET',
      protocol: 'http:',
      headers: headers
    },
    { hostname: 'abc.def',
      port: 80,
      path: '/ghi.jkl',
      method: 'GET',
      protocol: 'http:',
      headers: Object.assign({ 'if-none-match': '123' }, headers)
    },
    { hostname: 'abc.def',
      port: 443,
      path: '/ghi.jkl',
      method: 'GET',
      protocol: 'https:',
      headers: headers
    }
  ]
  t.plan(wanted.length)
  wanted.forEach((it) => {
    t.same(found.shift(), it)
  })
})

test('shield queries', (t) => {
  function go (i, o) {
    const input = i.shift()
    const wanted = o.shift()

    if (input && wanted) {
      const s = stread(input)
      const f = new query.Queries()

      s.on('end', () => {
        f.end()
      })

      f.on('error', (er) => {
        t.is(er.message, wanted.er, 'unexpected error for ' + wanted.index)
      })
      f.on('data', (qry) => {
        t.same(qry, wanted.res.shift())
      })
      f.on('end', () => {
        go(i, o)
      })

      s.pipe(f)
    } else {
      t.end()
    }
  }
  const wanted = [
    {},
    { er: 'query error: invalid query' },
    { er: 'query error: invalid query' },
    { er: 'query error: invalid query' },
    { res: [query('http://abc.de')] },
    { res: [query('http://abc.de')], er: 'query error: invalid query' },
    { res: [query('http://abc.de')], er: 'query error: invalid JSON' }
  ].map((item, index) => {
    // Adding index for easier orientation.
    item.index = index
    return item
  })
  go([
    '[]',
    '[{}]',
    '[{ "url": "" }]',
    '[{ "url": "http://" }]',
    '[{ "url": "http://abc.de" }]',
    '[{ "url": "http://abc.de" }, {}]',
    '[{ "url": "http://abc.de" }, {""}]'
  ],
  wanted)
})

test('all queries', (t) => {
  const p = path.join(__dirname, 'data', 'all.json')
  const file = fs.createReadStream(p)
  const uris = file.pipe(lino())
  const queries = new query.Queries()
  const wanted = [
    query('http://just/b2w.xml'),
    query('http://some/ddc.xml'),
    query('http://feeds/rl.xml'),
    query('http://for/rz.xml'),
    query('http://testing/tal.xml')
  ]
  t.plan(wanted.length)
  queries.on('readable', () => {
    t.same(queries.read(), wanted.shift())
  })
  var ok = true
  function read () {
    var chunk
    while ((chunk = uris.read())) {
      ok = queries.write(chunk)
    }
    if (!ok) queries.once('drain', read)
  }
  uris.on('readable', read)
})
