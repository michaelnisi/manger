#!/usr/bin/env node

// repl - kick the tires during development
// @ts-check

const fs = require('fs');
const repl = require('repl');
const split = require('binary-split');
const {Manger, createLevelDB} = require('./');
const {clear, dir, log} = require('console');
// eslint-disable-next-line no-unused-vars
const {Readable} = require('readable-stream');

function createManger() {
  const name = process.argv[2] || '/tmp/manger-repl';
  const db = createLevelDB(name);

  return new Manger(db, {objectMode: true});
}

const server = repl.start({
  ignoreUndefined: true,
  input: process.stdin,
  output: process.stdout,
  prompt: 'manger> ',
  useColors: true,
});

/**
 * Prints objects, or one of their properties, read from stream.
 *
 * @param {Readable} s A readable stream.
 * @param {string} prop A property name for filtering.
 */
function read(s, prop) {
  s.once('error', er => {
    log(er);
  })
    .on('readable', () => {
      let obj;
      while ((obj = s.read()) !== null) {
        const item = prop ? obj[prop] : obj;

        dir(item, {colors: true});
        server.displayPrompt();
      }
    })
    .on('end', () => {
      s.removeAllListeners();
      log('ok');
      server.displayPrompt();
    });
}

const cache = createManger();

/**
 * Fills the cache with some feeds.
 *
 * @param {string} prop The propery name to log (`title` by default).
 */
function fill(prop = 'title') {
  read(
    fs
      .createReadStream('./test/data/feeds')
      .pipe(split())
      .pipe(cache.feeds()),
    prop,
  );
}

const {context} = server;

context.clear = clear;
context.fill = fill;
context.read = read;
context.cache = cache;
