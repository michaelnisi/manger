var common = require('./lib/common')
var test = require('tap').test
var manger = require('../')

test('URLs', function (t) {
  var s = new manger.URLs()
  var names = ['end', 'readable']
  names.forEach(function (name) {
    s.on(name, function () {
      t.fail('should not become readable or end')
    })
  })
  setTimeout(t.end.bind(t), 100)
})

test('empty list', function (t) {
  var store = common.freshManger()
  var urls = store.list()
  t.plan(2)
  urls.on('readable', function () {
    t.is(urls.read(), null, 'should become readable')
  })
  urls.on('end', function () {
    t.ok(true, 'should end')
  })
})

test('teardown', function (t) {
  t.ok(!common.teardown())
  t.end()
})
