
var common = require('./common')
  , es = require('event-stream')
  , fs = require('fs')
  , manger = require('../')
  , query = require('../lib/query')
  , test = require('tap').test
  ;

test('setup', function (t) {
  common.setup(t)
})

test('empty list', function (t) {
  t.plan(2)
  var f = manger.FeedURLs
  t.ok(f, 'should be defined')
  var urls = f(common.opts())
    , actual = []
    ;
  urls.on('readable', function () {
    var chunk = null
    while (null !== (chunk = urls.read())) {
      actual.push(chunk)
    }
  })
  urls.on('end', function () {
    var wanted = []
    t.deepEqual(actual, wanted)
    t.end()
  })
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
  t.plan(8)
  var f = manger.Feeds
  t.ok(f, 'should be defined')
  var feeds = f(common.opts())

  var errors = []
  feeds.on('error', function (er) {
    errors.push(er)
  })
  var chunk
    , chunks = ''
    ;
  feeds.on('readable', function () {
    while (null !== (chunk = feeds.read())) {
      chunks += chunk
    }
  })
  feeds.on('finish', function () {
    t.is(errors.length, 2)
    var found = JSON.parse(chunks)
    t.is(found.length, 1)
    var first = found[0]
    t.is(first.title, 'Back to Work')
    t.end()
  })
  t.ok(feeds.write(q('xxx')))
  t.ok(feeds.write(q('http://xxx')))
  t.ok(feeds.write(q(url('b2w.xml'))), 'should be readable')
  t.ok(feeds.write(q(url('ddc.xml'), Date.now())), 'should be too recent')
  feeds.end()
})

test('put/get', function (t) {
  t.plan(8)
  var f = manger.putFeed
  t.ok(f, 'should be defined')
  var uri = 'http://localhost:1337/ddc.xml'
  var feed = {
    title: 'Decode DC'
  }
  f(common.db(), uri, feed, function (er, key) {
    t.ok(!er, 'should not error')
    t.ok(key, 'should be defined')
    t.is(key, 'fed\u0000http://localhost:1337/ddc.xml')
    manger.getFeed(common.db(), uri, function (er, val) {
      t.ok(!er, 'should not error')
      t.ok(!!val, 'should be defined')
      var found = JSON.parse(val)
      t.is(found.title, feed.title)
      t.ok(!er, 'should not error')
      t.end()
    })
  })
})

test('populate', function (t) {
  common.populate(t)
})

test('list', function (t) {
  t.plan(1)
  var urls = new manger.FeedURLs(common.opts())
    , actual = []
    ;
  urls.on('readable', function () {
    var chunk = null
    while (null !== (chunk = urls.read())) {
      actual.push(chunk)
    }
  })
  urls.on('end', function () {
    var wanted = common.urls()
    t.deepEqual(actual, wanted)
    t.end()
  })
})

test('pipe', function (t) {
  t.plan(2)
  var reader = fs.createReadStream('./queries/all.json')
    , queries = new query.Queries()
    , writer = new manger.Feeds(common.opts())
    , r = ''
    ;
  writer.on('data', function (chunk) {
    r += chunk
  })
  writer.on('finish', function () {
    var feeds = null
    function parse () {
      feeds = JSON.parse(r)
      t.is(feeds.length, 5)
    }
    t.doesNotThrow(parse)
    t.end()
  })
  reader
    .pipe(queries)
    .pipe(writer)
})

test('all feeds', function (t) {
  t.plan(1)
  var queries = es.readArray(common.queries())
    , write = es.writeArray(parse)
    ;
  function parse(er, found) {
    var feeds = JSON.parse(found.join(''))
    t.is(feeds.length, 5)
    t.end()
  }
  queries
    .pipe(new manger.Feeds(common.opts()))
    .pipe(write)
})

test('teardown', function (t) {
  common.teardown(t)
})
