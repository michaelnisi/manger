#!/usr/bin/env node

// repl - explore manger

const fs = require('fs')
const lino = require('lino')
const manger = require('./')
const repl = require('repl')
const { inspect } = require('util')

const name = process.argv[2] || '/tmp/manger-repl'
const cache = manger(name, { objectMode: true })

const server = repl.start({
  ignoreUndefined: true,
  input: process.stdin,
  output: process.stdout,
  prompt: 'manger> ',
  useColors: true
})

function read (s, prop) {
  const { log } = console

  s.once('error', er => {
    log(er)
  }).on('readable', () => {
    let obj
    while ((obj = s.read()) !== null) {
      let item = prop ? obj[prop] : obj

      log(inspect(item, { colors: true }))
    }
  }).on('end', () => {
    log('ok')
    server.displayPrompt()
  })

}

// Fills the cache with some feeds, many feeds…
function fill () {
  const lines = lino()
  let ok = true

  function _read () {
    let chunk
    while (ok && (chunk = lines.read()) !== null) {
      ok = feeds.write(chunk)
    }
    if (!ok) feeds.once('drain', _read)
  }

  lines.on('readable', _read)
  fs.createReadStream('./test/data/feeds').pipe(lines)
}

const { context } = server

context.cache = cache
context.fill = fill
context.read = read
