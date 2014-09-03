#!/usr/bin/env node

// repl - dev REPL

var levelup = require('levelup')
  , manger = require('./')
  , repl = require('repl')
  ;

process.on('uncaughtException', console.error)

repl.start({
  prompt: 'manger> '
, input: process.stdin
, output: process.stdout
}).context.manger = manger({
  db: levelup('/tmp/manger')
, readableObjectMode: true
})
