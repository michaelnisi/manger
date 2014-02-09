
var test = require('tap').test
  , fs = require('fs')
  , queries = require('../lib/queries')
  , stread = require('stread')

test('setup', function (t) {
  t.plan(1)
  t.ok(process.env.NODE_TEST, 'should be test environment')
  t.end()
})

test('flowing mode', function (t) {
  t.plan(1)
  var actual = []
  fs.createReadStream('./queries/all.json')
    .pipe(queries.queries())
    .on('error', function (er) {
      t.ok(!er, 'should not error')
    })
    .on('data', function (tuple) {
      actual.push(tuple)
    })
    .on('finish', function () {
      t.deepEqual(actual, all())
      t.end()
    })
})

test('non-flowing mode', function (t) {
  t.plan(1)
  var data = fs.readFileSync('./queries/all.json')
    , reader = stread(data)
    , writer = queries.queries()
    , actual = []

  writer
    .on('data', function (tuple) {
      actual.push(tuple)
    })
    .on('finish', function () {
      t.deepEqual(actual, all())
      t.end()
    })

  function size () {
    // TODO: Why does reader.read(0) crash?
    return Math.round(Math.random() * 16) + 1
  }
  ;(function write () {
    var ok = true, chunk = null
    while (null !== (chunk = reader.read(size())) && ok) {
      ok = writer.write(chunk)
    }
    if (!ok) {
      writer.once('drain', write)
    } else {
      writer.end()
    }
  })()
})

test('tuple', function (t) {
  t.plan(4)
  var f = queries.tuple
  var found = [
    ['http://5by5.tv/rss', 0]
  , ['http://5by5.tv/rss', 0]
  , ['http://5by5.tv/rss', 1387106898]
  , ['http://5by5.tv/rss', 1118862000000]
  ]
  ;[
    {url:'http://5by5.tv/rss'}
  , {url:'http://5by5.tv/rss', since:0}
  , {url:'http://5by5.tv/rss', since:1387106898}
  , {url:'http://5by5.tv/rss', since:'Wed, 15 Jun 2005 19:00:00 GMT'}
  ].forEach(function (term, i) {
    t.deepEqual(f(term), found[i])
  })
  t.end()
})

function all() {
  return [
    ['http://localhost:1337/b2w.xml', 0]
  , ['http://localhost:1337/ddc.xml', 0]
  , ['http://localhost:1337/rl.xml', 0]
  , ['http://localhost:1337/rz.xml', 0]
  , ['http://localhost:1337/tal.xml', 0]
  ]
}
