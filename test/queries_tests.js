
var test = require('tap').test
  , fs = require('fs')
  , queries = require('../lib/queries')
  , stread = require('stread')
  ;

test('setup', function (t) {
  t.plan(1)
  t.ok(process.env.NODE_TEST, 'should be test environment')
  t.end()
})

test('query', function (t) {
  var f = queries.query
  t.throws(f)
  var wanted = [
    f('abc', 0)
  , f('abc', 0)
  , f('abc', 0)
  ]
  ;
  [
    f('abc')
  , f('abc', 'Thu Jan 01 1970 01:00:00 GMT+0100 (CET)')
  , f('abc', '1970-01-01')
  ].forEach(function (query, i) {
    t.deepEquals(query, wanted[i])
  })
  t.end()
})

function query (url, since) {
  return new queries.query(url, since)
}

function all() {
  return [
    query('http://localhost:1337/b2w.xml', 0)
  , query('http://localhost:1337/ddc.xml', 0)
  , query('http://localhost:1337/rl.xml', 0)
  , query('http://localhost:1337/rz.xml', 0)
  , query('http://localhost:1337/tal.xml', 0)
  ]
}

test('flowing mode', function (t) {
  t.plan(1)
  var actual = []
  fs.createReadStream('./queries/all.json')
    .pipe(queries())
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
    , writer = queries()
    , actual = []
    ;
  writer
    .on('data', function (tuple) {
      actual.push(tuple)
    })
    .on('finish', function () {
      t.deepEqual(actual, all())
      t.end()
    })
  function size () {
    return Math.round(Math.random() * 16) + 1
  }
  (function write () {
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


