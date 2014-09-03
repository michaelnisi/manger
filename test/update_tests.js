
var common = require('./common')
  , es = require('event-stream')
  , manger = require('../')
  , test = require('tap').test
  ;

function update (t, plan, length) {
  t.plan(plan)
  var update = manger.update(common.opts())
  update.on('error', function (er) {
    t.is(er.message, 'no etag')
  })
  update.pipe(es.writeArray(function (er, chunks) {
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
  update(t, 2, 0)
})

test('populate', function (t) {
  common.populate(t)
})

test('populated', function (t) {
  update(t, 2, 0)
})

test('teardown', function (t) {
  common.teardown(t)
})
