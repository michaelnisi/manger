'use strict'

// rank - rank query counts

module.exports = {
  updateFeedRanking,
  Keys,
  allFeedURLs
}

const {
  decode,
  rank,
  URIFromFeed,
  allRanks,
  allFeeds,
  URIFromRank,
  ranked,
  countFromRank
} = require('./schema')

const { pipeline, Transform, Writable } = require('readable-stream')
const { debuglog, inherits } = require('util')

const debug = debuglog('manger')

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
  Transform.call(this, opts)
  this.snapshot = snapshot
}

inherits(Keys, Transform)

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
  const newKey = rank(uri, count)
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
      const key = rank(uri, count)
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

function allFeedURLs (db, cb) {
  let uris = []

  pipeline(
    db.createKeyStream(allFeeds),
    new Writable({ 
      write(chunk, enc, cb) {
        uris.push(URIFromFeed(chunk))
        cb()
      }
    }),
    error => {
      cb(error, uris)
    }
  )
}

/**
 * Updates ranking of feeds.
 * 
 * TODO: Fix me
 * 
 * @param {*} db 
 * @param {*} counter 
 * @param {*} cb 
 */
function updateFeedRanking (db, counter, cb) {
  debug('updating feed ranking')

  allFeedURLs(db, (er, all) => {
    debug('cached feeds: %s', all.length)

    const snapshot = Object.create(null)
    all.forEach((uri) => { snapshot[uri] = 0 })
    counter.forEach((value, key) => { snapshot[key] = value })

    const keys = new Keys(null, snapshot)
    const prev = db.createKeyStream(allRanks)
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
        const uri = URIFromRank(key)
        ops.push(new Put(
          ranked(uri),
          countFromRank(key)
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