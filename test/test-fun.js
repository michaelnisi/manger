
var test = require('tap').test
  , manger = require('../')

test('tuple from term', function (t) {
  var f = manger.tuple
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
