
var test = require('tap').test
  , manger = require('../')
  ;

test('newer', function (t) {
  var f = manger.newer
  t.plan(4)
  t.throws(f)
  var wanted = [
    true
  , true
  , true
  ]
  function item (time) {
    return { updated:time }
  }
  function query (time) {
    return { since:time }
  }
  [
    f(item(0), query(0))
  , f(item(1), query(0))
  , f(item(1), query(1))
  ].forEach(function (found, i) {
    t.equal(found, wanted[i])
  })
  t.end()
})
