
var test = require('tap').test
  , key = require('../lib/key')
  , manger = require('../')
  ;

test('env', function (t) {
  t.plan(1)
  t.ok(process.env.NODE_TEST, 'should be defined')
  t.end()
})

function url () {
  return 'http://abc.def/ghi.jkl'
}

test('key', function (t) {
  var f = key
  t.plan(8)
  t.throws(function () { f(null) })
  t.throws(function () { f(undefined) })
  t.throws(function () { f('WTF', {}) })
  t.throws(function () { f('WTF', query(url())) })
  var wanted = [
    'fed\u0000abc'
  , 'fed\u0000abc'
  , 'ent\u0000' + url() + '\u00000'
  , 'etg\u0000' + url()
  ]
  ;[
    f(key.FED, new manger.Query('abc'))
  , f(key.FED, new manger.Query('abc', 0))
  , f(key.ENT, new manger.Query(url(), 0))
  , f(key.ETG, new manger.Query(url()))
  ].forEach(function (found, i) {
    t.is(found, wanted[i])
  })
  t.end()
})
