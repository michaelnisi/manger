
var test = require('tap').test
  , fs = require('fs')
  , query = require('../lib/query')
  , stread = require('stread')
  ;

test('setup', function (t) {
  t.ok(process.env.NODE_TEST, 'should be test environment')
  t.end()
})

test('query', function (t) {
  var f = query.Query
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

function all() {
  var f = query.Query
  return [
    f('http://localhost:1337/b2w.xml', 0)
  , f('http://localhost:1337/ddc.xml', 0)
  , f('http://localhost:1337/rl.xml', 0)
  , f('http://localhost:1337/rz.xml', 0)
  , f('http://localhost:1337/tal.xml', 0)
  ]
}

test('flowing mode', function (t) {
  t.plan(1)
  var actual = []
    , f = query.Queries()
    ;
  fs.createReadStream('./queries/all.json')
    .pipe(f)
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

test('request', function (t) {
  var f = query.Query
  var found = [
    f('http://abc.def/ghi.jkl').request()
  , f('http://abc.def/ghi.jkl', null, '123').request()
  ];
  [
    { hostname:'abc.def'
    , port:80
    , path:'/ghi.jkl'
    }
  , { hostname:'abc.def'
    , port:80
    , path:'/ghi.jkl'
    , headers: {
        'If-None-Match': '123'
      }
    }
  ].forEach(function (req, i) {
    t.same(found[i], req)
  })
  t.end()
})

test('non-flowing mode', function (t) {
  t.plan(1)
  var data = fs.readFileSync('./queries/all.json')
    , reader = stread(data)
    , writer = query.Queries()
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
  function write () {
    var ok = true, chunk = null
    while (null !== (chunk = reader.read(size())) && ok) {
      ok = writer.write(chunk)
    }
    if (!ok) {
      writer.once('drain', write)
    } else {
      writer.end()
    }
  }
  write()
})
