#!/usr/bin/env node

// repl - dev REPL

var fs = require('fs')
var lino = require('lino')
var manger = require('./')
var repl = require('repl')
var util = require('util')

var ctx = repl.start({
  prompt: 'manger> ',
  ignoreUndefined: true,
  input: process.stdin,
  output: process.stdout
}).context

var name = process.argv[2] || '/tmp/manger-repl'
var svc = manger(name, {
  objectMode: true
})

var entries = svc.entries()
var feeds = svc.feeds()
var list = function () {
  var s = svc.list()
  s.on('error', console.error)
  return s
}
var update = function () {
  var s = svc.update()
  s.on('error', function (er) {
    console.error(er.stack)
  })
  return s
}
var ranks = function () {
  var s = svc.ranks()
  s.on('error', console.error)
  return s
}
var resetRanks = function () {
  svc.resetRanks(function (er) {
    if (er) console.error(er)
  })
}

;[entries, feeds].map(function (s) {
  s.on('error', console.error)
})

function read (stream, prop) {
  var obj
  while ((obj = stream.read()) !== null) {
    console.log(util.inspect(
      prop ? obj[prop] : obj, { colors: true }))
  }
}

function fill () {
  var lines = lino()
  var ok = true
  function _read () {
    var chunk
    while (ok && (chunk = lines.read()) !== null) {
      ok = feeds.write(chunk)
    }
    if (!ok) {
      feeds.once('drain', _read)
    }
  }
  lines.on('readable', _read)
  fs.createReadStream('./test/data/FEEDS')
    .pipe(lines)
}

function flushCounter () {
  svc.flushCounter()
}

ctx.entries = entries
ctx.feeds = feeds
ctx.fill = fill
ctx.flushCounter = flushCounter
ctx.list = list
ctx.ranks = ranks
ctx.read = read
ctx.resetRanks = resetRanks
ctx.svc = svc
ctx.update = update
