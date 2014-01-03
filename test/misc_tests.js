
var test = require('tap').test
  , manger = require('../')

test('stale', function (t) {
  t.plan(9)
  var f = manger.stale
  var wanted = [
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
  ].forEach(function (found, i) {
    t.equal(found, wanted[i])
  })
  t.end()
})
