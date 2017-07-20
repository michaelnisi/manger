const benchmark = require('benchmark')
const benchmarks = require('beautify-benchmark')
const crypto = require('crypto')
const fs = require('fs')
const xxhash = require('xxhash')

const words = fs.readFileSync('/usr/share/dict/words',
  { encoding: 'utf8' }
).split('\n')
words.rnd = function () {
  return this[Math.floor(Math.random() * this.length)]
}

function testSHA () {
  crypto.createHash('sha1').update(words.rnd()).digest('hex')
}

function testXXHash () {
  xxhash.hash(Buffer.from(words.rnd()), 0xCAFEBABE)
}

const suite = new benchmark.Suite()

suite.on('start', (e) => { process.stdout.write('Working...\n\n') })
suite.on('cycle', (e) => { benchmarks.add(e.target) })
suite.on('complete', () => { benchmarks.log() })

suite.add('md5', { minSamples: 100, fn: testSHA })
suite.add('xxhash', { minSamples: 100, fn: testXXHash })

suite.run({ async: false })
