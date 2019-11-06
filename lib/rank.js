'use strict'

// rank - rank query counts

exports = module.exports = rank

const schema = require('./schema')
const stream = require('readable-stream')
const util = require('util')
const { decode } = require('charwise')

// A Transform stream to update the rank index.
//
// - opts Object() Plain stream options.
// - snapshot Object() A set of feeds.
//
// A `snapshot` is a set of feeds, eg. { 'http://abc.de': 8, ... },
// where the property name is the URL of a feed and the value is its
// access count. The count gets added in the rank calculation.
function Keys (opts, snapshot) {
  if (!(this instanceof Keys)) return new Keys(opts, snapshot)
  stream.Transform.call(this, opts)
  this.snapshot = snapshot
}
util.inherits(Keys, stream.Transform)

// Update rank index keys considering the counter snapshot.
Keys.prototype._transform = function (chunk, enc, cb) {
  const key = decode(chunk)
  const uri = key[1][2]
  const data = this.snapshot[uri]
  let count = key[1][1]
  if (typeof data === 'number') {
    count += data
    this.snapshot[uri] = null
  }
  const newKey = schema.rank(uri, count)
  this.push(newKey)
  cb()
}

Keys.prototype._flush = function (cb) {
  const snapshot = this.snapshot
  const uris = Object.getOwnPropertyNames(snapshot)

  let ok = true

  const ondrain = () => {
    ok = true
    write()
  }

  const write = () => {
    let uri
    while (ok && (uri = uris.shift())) {
      const count = snapshot[uri]
      if (typeof count !== 'number') continue
      const key = schema.rank(uri, count)
      ok = this.push(key)
    }
    if (!ok) {
      this.once('drain', ondrain)
    } else {
      this.removeListener('drain', ondrain)
      cb()
    }
  }
  write()
}

function Delete (key) {
  this.key = key
  this.type = 'del'
}

function Put (key, value = 0) {
  this.key = key
  this.type = 'put'
  this.value = value
}

function allFeeds (db, cb) {
  const s = db.createKeyStream(schema.allFeeds)
  const uris = []

  const onend = (er) => {
    s.removeListener('data', ondata)
    s.removeListener('end', onend)
    s.removeListener('error', onend)
    if (cb) cb(er, uris)
  }
  const ondata = (chunk) => {
    const uri = schema.URIFromFeed(chunk)
    uris.push(uri)
  }

  s.on('data', ondata)
  s.on('end', onend)
  s.on('error', onend)
}

function rank (db, counter, cb) {
  allFeeds(db, (er, all) => {
    const snapshot = Object.create(null)
    all.forEach((uri) => { snapshot[uri] = 0 })
    counter.forEach((value, key) => { snapshot[key] = value })

    const keys = new Keys(null, snapshot)
    const prev = db.createKeyStream(schema.allRanks)
    const ops = []

    let ok = true

    function ondrain () {
      ok = true
      write()
    }
    function write () {
      let key
      while (ok && (key = prev.read()) !== null) {
        const op = new Delete(key)
        ops.push(op)
        ok = keys.write(key)
      }
      if (!ok) keys.once('drain', ondrain)
    }
    function onend () {
      keys.end()
    }

    prev.on('readable', write)
    prev.once('end', onend)
    prev.once('error', done)

    let count = 0

    function add () {
      let key
      while ((key = keys.read()) !== null) {
        ops.push(new Put(key))

        // Indexing the ranks
        const uri = schema.URIFromRank(key)
        ops.push(new Put(
          schema.ranked(uri),
          schema.countFromRank(key)
        ))

        count++
      }
    }
    function batch () {
      db.batch(ops, function (er) {
        done(er)
      })
    }
    function done (er) {
      prev.removeListener('end', onend)
      prev.removeListener('error', done)
      prev.removeListener('readable', write)

      keys.removeListener('error', done)
      keys.removeListener('finish', batch)
      keys.removeListener('ondrain', ondrain)
      keys.removeListener('readable', add)

      if (cb) cb(er, count)
    }

    keys.on('readable', add)
    keys.once('error', done)
    keys.once('finish', batch)
  })
}

if (process.mainModule.filename.match(/test/) !== null) {
  exports.Keys = Keys
  exports.allFeeds = allFeeds
}
