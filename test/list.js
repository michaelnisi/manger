'use strict'

const common = require('./lib/common')
const test = require('tap').test
const manger = require('../')

test('URLs', (t) => {
  const s = new manger.URLs()
  const names = ['end', 'readable']
  names.forEach((name) => {
    s.on(name, () => {
      t.fail('should not become readable or end')
    })
  })
  setTimeout(t.end.bind(t), 100)
})

test('empty list', (t) => {
  const store = common.freshManger()
  const urls = store.list()
  t.plan(2)
  urls.on('readable', () => {
    t.is(urls.read(), null, 'should become readable')
  })
  urls.on('end', () => {
    t.ok(true, 'should end')
  })
})

test('teardown', (t) => {
  t.ok(!common.teardown())
  t.end()
})
