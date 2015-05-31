var fs = require('fs')
var query = require('../lib/query')
var lino = require('lino')
var test = require('tap').test
var path = require('path')
var stread = require('stread')

test('query', function (t) {
  var f = query
  var found = [
    f('http://5by5.tv/rss'),
    f('http://5by5.tv/rss\n', 'Thu Jan 01 1970 01:00:00 GMT+0100 (CET)'),
    f(' http://5by5.tv/rss ', '1970-01-01'),
    f(' 5by5.tv/rss '),
    f('http://')
  ]
  var wanted = [
    f('http://5by5.tv/rss', 0),
    f('http://5by5.tv/rss', 0),
    f('http://5by5.tv/rss', 0),
    null,
    null
  ]
  t.plan(wanted.length)
  wanted.forEach(function (it) {
    t.deepEquals(found.shift(), it)
  })
})

test('request', function (t) {
  var f = query
  var found = [
    f('http://abc.def/ghi.jkl').request(),
    f('http://abc.def/ghi.jkl', null, '123').request(),
    f('https://abc.def/ghi.jkl').request()
  ]
  var wanted = [
    { hostname: 'abc.def',
      port: 80,
      path: '/ghi.jkl',
      method: 'GET',
      protocol: 'http:'
    },
    { hostname: 'abc.def',
      port: 80,
      path: '/ghi.jkl',
      method: 'GET',
      protocol: 'http:',
      headers: {
        'If-None-Match': '123'
      }
    },
    { hostname: 'abc.def',
      port: 443,
      path: '/ghi.jkl',
      method: 'GET',
      protocol: 'https:'
    }
  ]
  t.plan(wanted.length)
  wanted.forEach(function (it) {
    t.same(found.shift(), it)
  })
})

test('shield queries', function (t) {
  t.plan(4)
  function go (i, o) {
    var input = i.shift()
    var wanted = o.shift()
    if (input && wanted) {
      var s = stread(input)
      var f = new query.Queries()
      f.on('error', function (er) {
        t.is(er.message, wanted.er, 'should be expected error')
      })
      f.on('data', function (qry) {
        t.same(qry, wanted.res.shift())
      })
      f.on('end', function () {
        f.removeAllListeners()
        go(i, o)
      })
      s.pipe(f)
    }
  }
  go([
    '[]',
    '[{}]',
    '[{ "url": "" }]',
    '[{ "url": "http://" }]',
    '[{ "url": "http://abc.de" }]'
  ], [
    {},
    { er: 'invalid query' },
    { er: 'invalid query' },
    { er: 'invalid query' },
    { res: [query('http://abc.de')] }
  ])
})

test('all queries', function (t) {
  var p = path.join(__dirname, 'data', 'all.json')
  var file = fs.createReadStream(p)
  var uris = file.pipe(lino())
  var queries = new query.Queries()
  var wanted = [
    query('http://just/b2w.xml'),
    query('http://some/ddc.xml'),
    query('http://feeds/rl.xml'),
    query('http://for/rz.xml'),
    query('http://testing/tal.xml')
  ]
  t.plan(wanted.length)
  queries.on('readable', function () {
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
