
var test = require('tap').test
  , fs = require('fs')
  , common = require('./common')
  , manger = require('../')

test('setup', function (t) {
  common.setup(t)
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
    t.is(key, 'fed\u0000601f29450478a48da60aa263c38eea33e3a60ff9')
    manger.getFeed(common.db(), uri, function (er, val) {
      t.ok(!er, 'should not error')
      t.ok(!!val, 'should be defined')
      var found = JSON.parse(val), wanted = feed
      t.is(found.title, wanted.title)
      t.ok(!er, 'should not error')
      t.end()
    })
  })
})

test('pipe', function (t) {
  t.plan(2)
  var reader = fs.createReadStream('./queries/all.json')
    , queries = manger.queries()
    , writer = manger.feeds(opts())
  var r = ''
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

/*
test('update', function (t) {
  t.plan(2)
  var f = manger.update, r = ''
  f(opts())
    .on('data', function (chunk) {
      r += chunk
    })
    .on('finish', function () {
      var feeds = null
      function parse () {
        feeds = JSON.parse(r)
        console.error(feeds)
        t.is(feeds.length, 1) // in prev test we put one feed without etag
      }
      t.doesNotThrow(parse)
      t.end()
    })
})
*/

function opts () {
  return manger.opts(common.db())
}

test('teardown', function (t) {
  common.teardown(t)
})
