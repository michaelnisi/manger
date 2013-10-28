
// test shit

var test = require('tap').test
  , stream = require('../lib/pickup_to_puts.js')
  , http = require('http')
  , pickup = require('pickup')
  , put_from_entry = stream.put_from_entry

test('stream', function (t) {
  var s = stream()
  t.ok(s.writable, 'should be writable')
  t.ok(s.readable, 'should be readable')

  var url = 'http://troubled.pro/rss.xml'

  http.get(url, function (res) {
    t.ok(res, 'should respond')
    res
      .pipe(pickup())
      .pipe(s)
      .on('finish', function () {
        t.end()
      })
  })
})

test('put from entry', function (t) {
  t.equals(put_from_entry(null), null, 'should be null')
  t.equals(put_from_entry(undefined), null, 'should be null')

  var entry = '{"id":"http://troubled.pro/2013/03/learning-from-erlang.html","link":"http://troubled.pro/2013/03/learning-from-erlang.html","title":"Learning from Erlang","updated":"Wed, 06 Mar 2013 01:00:00 +0100"}'

  var key = 'BL7gkqIZT0wnOFHwUjCHAQ==\\x001362528000000\\x00BL7gkqIZT0wnOFHwUjCHAQ=='

  var expected = {
    type:'put', key:key, value:entry
  }

  var actual = put_from_entry(entry)
  t.ok(actual, 'should not be null')
  t.deepEquals(actual, expected, 'should be equal')
  t.end()
})
