
var test = require('tap').test
  , assert = require('assert')
  , http = require('http')
  , pickup = require('pickup')
  , rimraf = require('rimraf')
  , fs = require('fs')
  , levelup = require('levelup')
  , path  = require('path')
  , Writable = require('stream').Writable
  , Store = require('../lib/manger').Store

var dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
  , loc = path.join(dir, 'test.db')

test('setup', function (t) {
  fs.mkdirSync(dir, 0700)
  t.ok(fs.statSync(dir).isDirectory(), 'should exist')
  t.end()
})

test('Store', function (t) {
  var store = new Store(levelup(loc))
  var tuples = [
    ['troubled.pro/rss.xml', 2013, 10]
  , ['feeds.muleradio.net/allmodcons', 2013]
  ]
  function write () {
    var tuple, ok = true, i = 0, len = tuples.length
    while (i < len && ok) {
      tuple = tuples[i++]
      ok = store.write(tuple)
    }
    if (i === len) store.end()
  }
  store.once('drain', write)
  store.on('data', function (data) {
    console.error(data)
  })
  store.on('finish', function () {
    t.end()
  })
  write()
})

test('teardown', function (t) {
  rimraf(dir, function (err) {
    fs.stat(dir, function (err) {
      t.ok(!!err, 'should clean up after ourselves')
      t.end()
    })
  })
})
