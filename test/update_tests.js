
var common = require('./common')
  , es = require('event-stream')
  , manger = require('../')
  , test = require('tap').test
  ;

function update (t, length) {
  t.plan(2)
  manger.update(common.opts())
    .pipe(es.writeArray(function (er, chunks) {
      t.ok(!er, 'should not error')
      var actual = JSON.parse(chunks.join(''))
      t.is(actual.length, length)
      t.end()
    }))
}

test('setup', function (t) {
  common.setup(t)
})

test('empty', function (t) {
  update(t, 0)
})

test('populate', function (t) {
  common.populate(t)
})

test('populated', function (t) {
  update(t, 5)
})

test('teardown', function (t) {
  common.teardown(t)
})
