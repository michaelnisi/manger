'use strict'

const { html, entryID, duration, entryLink } = require('../lib/strings')
const { test } = require('tap')

test('html', t => {
  t.is(html({}), undefined)
  t.is(html('<html><h1>Hello</h1></html>'), '<h1>Hello</h1>')
  t.end()
})

test('entry identity', (t) => {
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
    entryID(null),
    entryID(undefined),
    entryID({}),
    entryID({ url: 'https://example.com' }),
    entryID({ id: 'abc' }),
    entryID({ url: 'https://example.com', id: 'abc' }),
    entryID({ url: 'https://example.com', link: 'abc' }),
    entryID({ url: 'https://example.com', title: 'abc' })
  ]

  t.plan(wanted.length)

  for (const it of wanted) {
    t.same(found.shift(), it)
  }
})

test('duration', (t) => {
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
    duration(null),
    duration(undefined),
    duration(''),
    duration('hello'),
    duration('60'),
    duration('60:00'),
    duration('01:30:00'),
    duration('01:30:00:55'),
    duration('1:30:0'),
    duration('00:00:00')
  ]

  t.plan(wanted.length)

  for (const it of wanted) {
    t.same(found.shift(), it)
  }
})

test('entry link', (t) => {
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
    entryLink(),
    entryLink({}),
    entryLink({ link: a }),
    entryLink({ link: b }),
    entryLink({ link: c }),
    entryLink({ link: a, enclosure: { url: a } }),
    entryLink({ link: b, enclosure: { url: b } }),
    entryLink({ link: c, enclosure: { url: c } }),
    entryLink({ link: 'http://abc.de/fgh.mp3' }),
    entryLink({ link: 'abc.de' })
  ]

  t.plan(wanted.length)

  for (const it of wanted) {
    t.same(found.shift(), it)
  }
})
