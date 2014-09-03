
var assert = require('assert')
  , common = require('./common')
  , events = require('events')
  , gridlock = require('gridlock')
  , es = require('event-stream')
  , manger = require('../')
  , query = require('../lib/query')
  , stread = require('stread')
  , stream = require('stream')
  , test = require('tap').test
  ;

test('setup', function (t) {
  common.setup(t)
})

function items (arr) {
  return JSON.parse(arr.join(''))
}

function q (url, since) {
  return new manger.Query(url, since)
}

function url (file) {
  return common.url(file)
}

test('write', function (t) {
  var f = manger.Entries
  t.ok(f, 'should be defined')

  var opts = common.opts()
  opts.highWaterMark = 4
  var entries = f(opts)

  var errors = []
  entries.on('error', function (er) {
    errors.push(er)
  })
  es.readArray([
    'xxx'
  , 'http://xxx'
  , url('broken.xml')
  , q(url('b2w.xml'), '2013-12-17')
  ]).pipe(entries)
    .pipe(
  es.writeArray(function (er, arr) {
    t.ok(!er)
    t.same(errors.map(function (er) {
      return er.message
    }), [
      'connect ECONNREFUSED'
    , 'getaddrinfo ENOTFOUND'
    , 'Unexpected close tag'
    ])
    var entries = items(arr)
    var entry = entries[0]
    t.is(entries.length, 1)
    t.is(entry.title, 'Back to Work 150: Ask for John Klumpp')
    t.is(entry.updated, 1387317600000)
    t.is(entry.feed, 'http://localhost:1337/b2w.xml')
    t.end()
  }))
})

test('lock', function (t) {
  var f = manger.Entries
  var opts = common.opts()
  var lock = gridlock()
  var a = f(opts, lock)
  a.pipe(new stream.PassThrough())
  var b = f(opts, lock)
  b.pipe(new stream.PassThrough())
  var uri = url('ddc.xml')
  a.write(uri)
  b.write(uri)
  b.on('finish', function () {
    t.end()
  })
  a.end()
  b.end()
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
    manger.getEntry(common.db(), q(uri, 1380578400000), function (er, val) {
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
  var f = manger.Entries
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
      .pipe(new query.Queries())
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
    .pipe(new query.Queries())
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
    .pipe(new manger.Entries(common.opts()))
    .pipe(write)
})

test('teardown', function (t) {
  common.teardown(t)
})

