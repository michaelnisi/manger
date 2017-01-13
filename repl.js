#!/usr/bin/env node

// repl - explore manger

const fs = require('fs')
const lino = require('lino')
const manger = require('./')
const repl = require('repl')
const util = require('util')

const ctx = repl.start({
  prompt: 'manger> ',
  ignoreUndefined: true,
  input: process.stdin,
  output: process.stdout
}).context

const name = process.argv[2] || '/tmp/manger-repl'
const svc = manger(name, {
  objectMode: true
})

const entries = svc.entries()
const feeds = svc.feeds()
const list = () => {
  const s = svc.list()
  s.on('error', console.error)
  return s
}
const update = function () {
  const s = svc.update()
  s.on('error', (er) => {
    console.error(er.stack)
  })
  return s
}
const ranks = function (limit) {
  const s = svc.ranks(limit)
  s.on('error', console.error)
  return s
}
const resetRanks = function () {
  svc.resetRanks((er) => {
    if (er) console.error(er)
  })
}

;[entries, feeds].map((s) => {
  s.on('error', console.error)
})

function read (stream, prop) {
  let obj
  while ((obj = stream.read()) !== null) {
    console.log(util.inspect(
      prop ? obj[prop] : obj, { colors: true }))
  }
}

function fill () {
  const lines = lino()
  let ok = true
  function _read () {
    let chunk
    while (ok && (chunk = lines.read()) !== null) {
      ok = feeds.write(chunk)
    }
    if (!ok) {
      feeds.once('drain', _read)
    }
  }
  lines.on('readable', _read)
  fs.createReadStream('./test/data/feeds')
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
