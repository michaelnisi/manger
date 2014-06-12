
var test = require('tap').test
  , manger = require('../')
  ;

test('newer', function (t) {
  var f = manger.newer
  t.plan(4)
  t.throws(f)
  var wanted = [
    false
  , true
  , false
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

test('stale', function (t) {
  t.plan(9)
  var f = manger.stale
    , wanted = [
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
  ;
  [
    f(undefined, 3)
  , f(null, 3)
  , f(undefined, 2)
  , f(null, 2)
  , f(undefined, 1)
  , f(null, 1)
  , f({}, 1)
  , f({}, 2)
  , f({}, 3)
  ].forEach(function (found, i) {
    t.equal(found, wanted[i])
  })
  t.end()
})
