
// pickup_to_ops - test pickup() to put operation

var test = require('tap').test
  , http = require('http')
  , pickup = require('pickup')
  , Writable = require('stream').Writable

var stream = require('../lib/pickup_to_puts')

test('stream', function (t) {
  var s = stream()
  t.ok(s.writable, 'should be writable')
  t.ok(s.readable, 'should be readable')

  var url = 'http://troubled.pro/rss.xml' // TODO: write test server
  var ops = []
  var writer = new Writable({ objectMode:true })
  writer._write = function (chunk, enc, cb) {
    ops.push(chunk)
    cb()
  }

  http.get(url, function (res) {
    t.ok(res, 'should respond')
    res
      .pipe(pickup())
      .pipe(s)
      .pipe(writer)
      .on('finish', function () {
        t.ok(ops.length > 0, 'should not be empty')
        ops.forEach(function (op) {
          t.equal(op.type, 'put', 'should be put')
        })
        t.end()
      })
  })
})

