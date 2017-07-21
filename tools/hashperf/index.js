'use strict'

// hashperf - measure non-cryptographic hash functions

const benchmark = require('benchmark')
const benchmarks = require('beautify-benchmark')
const crypto = require('crypto')
const fnv = require('dding-fnv')
const fs = require('fs')
const xxhash = require('xxhash')

const words = fs.readFileSync('/usr/share/dict/words',
  { encoding: 'utf8' }
).split('\n')
words.random = function () {
  return this[Math.floor(Math.random() * this.length)]
}

function testSHA () {
  crypto.createHash('sha1').update(words.random()).digest('hex')
}

function testXXHash () {
  xxhash.hash(Buffer.from(words.random()), 0xCAFEBABE)
}

function testFNV () {
  fnv.hash32(words.random(), '1a').toHex()
}

const suite = new benchmark.Suite()

suite.on('start', (e) => { process.stdout.write('working...\n\n') })
suite.on('cycle', (e) => { benchmarks.add(e.target) })
suite.on('complete', () => { benchmarks.log() })

suite.add('crypto-sha1', { minSamples: 100, fn: testSHA })
suite.add('xxhash', { minSamples: 100, fn: testXXHash })
suite.add('dding-fnv', { minSamples: 100, fn: testFNV })

suite.run({ async: false })
