
// pickup_to_puts - test pickup() to put operation

var test = require('tap').test
  , stream = require('../lib/pickup_to_puts')
  , http = require('http')
  , pickup = require('pickup')
  , Writable = require('stream').Writable

test('stream', function (t) {
  var s = stream()
  t.ok(s.writable, 'should be writable')
  t.ok(s.readable, 'should be readable')

  var url = 'http://troubled.pro/rss.xml' // TODO: write test server
  var puts = []
  var writer = new Writable({ objectMode:true })
  writer._write = function (chunk, enc, cb) {
    puts.push(chunk)
    cb()
  }

  http.get(url, function (res) {
    t.ok(res, 'should respond')
    res
      .pipe(pickup())
      .pipe(s)
      .pipe(writer)
      .on('finish', function () {
        t.ok(puts.length > 0, 'should not be empty')
        t.end()
      })
  })
})

