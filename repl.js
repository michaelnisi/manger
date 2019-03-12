#!/usr/bin/env node
'use strict'

// repl - explore manger

const fs = require('fs')
const repl = require('repl')
const split = require('binary-split')
const { Manger } = require('./')
const { clear, dir, log } = require('console')

const name = process.argv[2] || '/tmp/manger-repl'
const cache = new Manger(name, { objectMode: true })

const server = repl.start({
  ignoreUndefined: true,
  input: process.stdin,
  output: process.stdout,
  prompt: 'manger> ',
  useColors: true
})

// Prints objects, or one of their properties, read from stream.
function read (s, prop) {
  s.once('error', er => {
    log(er)
  }).on('readable', () => {
    let obj
    while ((obj = s.read()) !== null) {
      let item = prop ? obj[prop] : obj

      dir(item, { colors: true })
    }
  }).on('end', () => {
    s.removeAllListeners()
    log('ok')
    server.displayPrompt()
  })
}

// Fills the cache with some feeds.
function fill (prop = 'title') {
  read(fs.createReadStream('./test/data/feeds')
    .pipe(split())
    .pipe(cache.feeds()), prop)
}

const { context } = server

context.clear = clear
context.fill = fill
context.read = read

Object.getOwnPropertyNames(Manger.prototype).forEach(name => {
  const f = cache[name]
  if (name === 'constructor' || typeof f !== 'function') return
  context[name] = f.bind(cache)
})
