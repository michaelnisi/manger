'use strict'

const strings = require('../lib/strings')
const test = require('tap').test

test('entry identity', (t) => {
  const f = strings.entryID
  const wanted = [
    null,
    null,
    null,
    null,
    null,
    '8005a4160503520f79992a76a8374cd6e28af05f',
    '8005a4160503520f79992a76a8374cd6e28af05f',
    '8005a4160503520f79992a76a8374cd6e28af05f'
  ]
  const found = [
    f(null),
    f(undefined),
    f({}),
    f({ url: 'https://example.com' }),
    f({ id: 'abc' }),
    f({ url: 'https://example.com', id: 'abc' }),
    f({ url: 'https://example.com', link: 'abc' }),
    f({ url: 'https://example.com', title: 'abc' })
  ]
  t.plan(wanted.length)
  wanted.forEach((it) => {
    t.same(found.shift(), it)
  })
})

test('duration', (t) => {
  const f = strings.duration
  const wanted = [
    null,
    null,
    null,
    null,
    60,
    3600,
    5400,
    5400,
    5400,
    null
  ]
  const found = [
    f(null),
    f(undefined),
    f(''),
    f('hello'),
    f('60'),
    f('60:00'),
    f('01:30:00'),
    f('01:30:00:55'),
    f('1:30:0'),
    f('00:00:00')
  ]
  t.plan(wanted.length)
  wanted.forEach((it) => {
    t.same(found.shift(), it)
  })
})

test('entry link', (t) => {
  const f = strings.entryLink

  const a = 'http://abc.de/fgh'
  const b = 'http://abc.de/fgh.html'
  const c = 'http://abc.de/fgh.htm'

  const wanted = [
    null,
    null,
    a,
    b,
    c,
    null,
    null,
    null,
    null,
    null
  ]
  const found = [
    f(),
    f({}),
    f({ link: a }),
    f({ link: b }),
    f({ link: c }),
    f({ link: a, enclosure: { url: a } }),
    f({ link: b, enclosure: { url: b } }),
    f({ link: c, enclosure: { url: c } }),
    f({ link: 'http://abc.de/fgh.mp3' }),
    f({ link: 'abc.def' })
  ]

  t.plan(wanted.length)
  wanted.forEach(item => { t.same(found.shift(), item) })
})
