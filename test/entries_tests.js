
var test = require('tap').test
  , stread = require('stread')
  , common = require('./common')
  , manger = require('../')
  , es = require('event-stream')
  ;

test('setup', function (t) {
  common.setup(t)
})

function items (arr) {
  return JSON.parse(arr.join(''))
}

function q (url, since) {
  return manger.query(url, since)
}

function url (file) {
  return common.url(file)
}

test('write', function (t) {
  t.plan(10)
  var f = manger.entries
  t.ok(f, 'should be defined')

  var entries = f(common.opts())
  t.throws(function () { entries.write('xxx') })
  t.ok(entries.write(q('http://xxx')), 'should just continue')
  t.ok(entries.write(q(url('broken.xml'))), 'should just continue')
  t.ok(entries.write(q(url('b2w.xml'), '2013-12-17')), 'should work')

  entries.pipe(es.writeArray(function (er, arr) {
    t.ok(!er)
    var entries = items(arr)
      , entry = entries[0]
      ;
    t.is(entries.length, 1)
    t.is(entry.title, 'Back to Work 150: Ask for John Klumpp')
    t.is(entry.updated, 1387317600000)
    t.is(entry.feed, 'http://localhost:1337/b2w.xml')
    t.end()
  }))
  entries.end()
})

test('put/get', function (t) {
  t.plan(9)
  var f = manger.putEntry
  t.ok(f, 'should be defined')
  var uri = 'feeds.feedburner.com/cre-podcast'
    , entry = { title:'Mavericks', updated:1380578400000 }
  ;
  f(common.db(), uri, entry, function (er, key) {
    t.ok(!er, 'should not error')
    t.ok(key, 'should be defined')
    t.is(key, 'ent\u0000feeds.feedburner.com/cre-podcast\u00001380578400000')
    manger.getEntry(common.db(), manger.query(uri, 1380578400000), function (er, val) {
      t.ok(!er, 'should not error')
      t.ok(!!val, 'should be defined')

      function parse(val) {
        return JSON.parse(val)
      }

      var found = parse(val)
        , wanted = entry

      t.is(found.title, wanted.title)
      t.is(found.updated, wanted.updated)
      t.ok(!er, 'should not error')
      t.end()
    })
  })
})

test('pipe', function (t) {
  var f = manger.entries
  t.ok(f, 'should be defined')
  function json () {
    return JSON.stringify([
      { url:'http://localhost:1337/ddc.xml'
      , since:Date.UTC(2013, 9)
      }
    ])
  }
  function opts () {
    return { db:common.db() }
  }
  function retrieve () {
    var data = ''
    stread(json())
      .pipe(manger.queries())
      .pipe(f(opts()))
      .on('data', function (chunk) {
        data += chunk
      })
      .on('finish', function () {
        var found = JSON.parse(data)
        t.ok(found.length > 0)
        // TODO: Write meaningful tests
        t.end()
      })
  }
  stread(json())
    .pipe(manger.queries())
    .pipe(f(opts()))
    .on('finish', retrieve)
})

test('populate', function (t) {
  common.populate(t)
})

test('all entries', function (t) {
  t.plan(1)
  var queries = es.readArray(common.queries())
    , write = es.writeArray(parse)
    ;
  function parse(er, found) {
    var entries = JSON.parse(found.join(''))
    t.is(entries.length, 376)
    t.end()
  }
  queries
    .pipe(manger.entries(common.opts()))
    .pipe(write)
})

test('teardown', function (t) {
  common.teardown(t)
})

