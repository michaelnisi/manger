
var test = require('tap').test
  , fs = require('fs')
  , common = require('./common')
  , requests = require('../lib/requests.js')

test('setup', function (t) {
  common.setup(t)
})

test('request etag', function (t) {
  t.plan(2)
  var f = requests.requestEtag
  f('http://localhost:1337/b2w.xml', function (er, etag) {
    t.ok(!er, 'should not error')
    t.ok(!!etag, 'should be defined')
    t.end()
  })
})

test('changed', function (t) {
  t.plan(4)
  var f = requests.changed
    , uri ='http://localhost:1337/rl.xml'

  f(null, uri, function (er, changed) {
    t.ok(!er, 'should not error')
    t.ok(changed, 'should be changed')
  })
  requests.requestEtag(uri, function (er, etag) {
    f(etag, uri, function (er, changed) {
      t.ok(!er, 'should not error')
      t.ok(!changed, 'should not be changed')
      t.end()
    })
  })
})

test('teardown', function (t) {
  common.teardown(t)
})
