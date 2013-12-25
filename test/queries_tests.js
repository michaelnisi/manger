
var test = require('tap').test
  , bufferEqual = require('buffer-equal')
  , fs = require('fs')
  , queries = require('../lib/queries')
  , stread = require('stread')

test('setup', function (t) {
  t.ok(process.env.NODE_TEST, 'should be test test environment')
  t.end()
})

test('flowing mode', function (t) {
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
    // TODO: Why does read(0) crash?
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
  var f = queries.tuple
  var expected = [
    ['http://5by5.tv/rss', 1970, 0,  1, 0,  0,  0]
  , ['http://5by5.tv/rss', 1970, 0,  1, 0,  0,  0]
  , ['http://5by5.tv/rss', 1970, 0, 17, 1, 18, 26]
  ]
  ;[
    {url:'http://5by5.tv/rss'}
  , {url:'http://5by5.tv/rss', since:0}
  , {url:'http://5by5.tv/rss', since:1387106898}
  ].forEach(function (term, i) {
    t.deepEqual(f(term), expected[i])
  })
  t.end()
})

function all() {
  return [
    ['localhost:1337/b2w.xml', 1970, 0, 1, 0, 0, 0]
  , ['localhost:1337/ddc.xml', 1970, 0, 1, 0, 0, 0]
  , ['localhost:1337/rl.xml', 1970, 0, 1, 0, 0, 0]
  , ['localhost:1337/rz.xml', 1970, 0, 1, 0, 0, 0]
  , ['localhost:1337/tal.xml', 1970, 0, 1, 0, 0, 0]
  ]
}
