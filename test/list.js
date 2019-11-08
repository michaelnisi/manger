'use strict'

const common = require('./lib/common')
const { test } = require('tap')
const { URLs } = require('../')

test('URLs', t => {
  const s = new URLs()
  const names = ['end', 'readable']

  names.forEach((name) => {
    s.on(name, () => {
      t.fail('should not become readable or end')
    })
  })

  setTimeout(t.end.bind(t), 100)
})

test('empty list', t => {
  const store = common.createManger()
  const urls = store.list()

  t.plan(3)

  urls.on('readable', () => {
    t.is(urls.read(), null, 'should become readable')
  })

  urls.on('end', () => {
    t.pass('should end')
    common.teardown(store, (er) => {
      if (er) throw er
      t.pass('should teardown')
    })
  })
})
