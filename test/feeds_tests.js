
var common = require('./common')
  , es = require('event-stream')
  , fs = require('fs')
  , manger = require('../')
  , test = require('tap').test
  ;

test('setup', function (t) {
  common.setup(t)
})

test('constructor', function (t) {
  var f = manger.list
  t.plan(3)
  t.ok(f, 'should be defined')
  t.throws(f)
  t.throws(function () { f({}) })
  t.end()
})

test('empty list', function (t) {
  t.plan(2)
  var f = manger.list
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
  return manger.query(url, since)
}

function url (file) {
  return common.url(file)
}

test('write', function (t) {
  t.plan(11)
  var f = manger.feeds
  t.ok(f, 'should be defined')

  var feeds = f(common.opts())
  t.throws(function () { feeds.write('xxx') })
  t.ok(feeds.write(q('http://xxx')), 'should just continue')
  t.ok(feeds.write(q(url('b2w.xml'))), 'should work')
  t.ok(feeds.write(q(url('ddc.xml'), Date.now())), 'should be too old')

  feeds.pipe(es.writeArray(function (er, arr) {
    t.ok(!er)
    var feeds = items(arr)
    t.is(feeds.length, 1)
    var feed = feeds[0]
    t.is(feed.title, 'Back to Work')
    t.is(feed.link, 'http://5by5.tv/b2w')
    t.is(feed.updated, 1387317600000)
    t.is(feed.feed, 'http://localhost:1337/b2w.xml')
    t.end()
  }))
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
  var urls = manger.list(common.opts())
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
    , queries = manger.queries()
    , writer = manger.feeds(common.opts())
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
    .pipe(manger.feeds(common.opts()))
    .pipe(write)
})

test('teardown', function (t) {
  common.teardown(t)
})
