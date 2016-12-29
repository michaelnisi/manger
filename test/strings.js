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
    f({ feed: 'https://example.com' }),
    f({ id: 'abc' }),
    f({ feed: 'https://example.com', id: 'abc' }),
    f({ feed: 'https://example.com', link: 'abc' }),
    f({ feed: 'https://example.com', title: 'abc' })
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

test('html', (t) => {
  const f = strings.html
  const wanted = [
    null,
    null,
    null,
    '',
    '<h1>Headlines are fine</h1>',
    '<h1>Headline are fine</h1><p>Paragraphs too</p>',
    '<h1>Headline are fine</h1><p>Paragraphs too, but no images</p>',
    'no tables',
    '<br />self closing<br />'
  ]
  const found = [
    f(),
    f(null),
    f(0),
    f(''),
    f('<h1>Headlines are fine</h1>'),
    f('<h1>Headline are fine</h1><p>Paragraphs too</p>'),
    f('<h1>Headline are fine</h1><p>Paragraphs too, <img>but no images</img></p>'),
    f('<table>no tables<table>'),
    f('<br>self closing<br>')
  ]
  t.plan(wanted.length)
  wanted.forEach((it) => {
    t.same(found.shift(), it)
  })
})
