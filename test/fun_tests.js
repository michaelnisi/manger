
var test = require('tap').test
  , manger = require('../')

test('stale', function (t) {
  var f = manger.stale
  var expected = [
    true
  , true
  , false
  , false
  , true
  , true
  , true
  , false
  , false
  ]
  ;[
    f(undefined, 3)
  , f(null, 3)
  , f(undefined, 2)
  , f(null, 2)
  , f(undefined, 1)
  , f(null, 1)
  , f({}, 1)
  , f({}, 2)
  , f({}, 3)
  ].forEach(function (term, i) {
    t.equal(term, expected[i])
  })
  t.end()
})

test('key from Date', function (t) {
  var actual = [
    manger.keyFromDate(new Date('Dec 08, 2013'))
  , manger.keyFromDate(new Date('Jan 12, 2013'))
  ]
  var expected = [
    '2013\x0012\x0008'
  , '2013\x0001\x0012'
  ]
  t.deepEqual(actual, expected)
  t.end()
})

test('is requested', function (t) {
  var fun = manger.newer
  t.ok(fun(new Date(2012, 8, 8), ['url', 2011, 10, 10]), 'should be newer')
  t.ok(!fun(new Date(2012, 8, 8), ['url', 2013, 10, 10], 'should be older'))
  t.ok(fun(new Date(2013, 11, 11), ['url', 2013, 10, 10]), 'should be newer')
  t.ok(fun(new Date(2013, 10, 11), ['url', 2013, 10, 10]), 'should be newer')
  t.ok(!fun(new Date(2013, 9, 9), ['url', 2013, 10, 10]), 'should be older')
  t.ok(fun(new Date('Wed, 06 Mar 2013 01:00:00 +0100'), ['url', 2013]), 'should be newer')
  t.ok(fun(new Date(), ['url', 2013]), 'should be newer')
  t.end()
})

test('tuple from URL', function (t) {
  var urls = [
    ''
  , '/'
  , 'troubled.pro'
  , 'troubled.pro/rss.xml/2012/12/7'
  , 'troubled.pro/rss.xml/2012/12/07'
  ]
  var tuples = [
    null
  , null
  , ['troubled.pro']
  , ['troubled.pro/rss.xml', 2012, 12, 7]
  , ['troubled.pro/rss.xml', 2012, 12, 7]
  ]
  urls.forEach(function (uri, i) {
    t.deepEqual(manger.tupleFromUrl(uri), tuples[i])
  })
  t.end()
})
