'use strict'

// rank - rank query counts

const { pipeline, Transform, Writable } = require('readable-stream')
const { debuglog, inherits } = require('util')
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

module.exports = {
  updateFeedRanking,
  Keys,
  allFeedURLs
}

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
  const uris = []

  pipeline(
    db.createKeyStream(allFeeds),
    new Writable({
      write (chunk, enc, cb) {
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

    const ops = []
    let count = 0

    pipeline(
      db.createKeyStream(allRanks),
      new Transform({
        transform (chunk, enc, cb) {
          debug('transforming key: %s', chunk)
          const op = new Delete(chunk)

          ops.push(op)
          cb(null, chunk)
        }
      }),
      new Keys(null, snapshot),
      new Writable({
        write (chunk, enc, cb) {
          ops.push(new Put(chunk))

          // Indexing the ranks
          const uri = URIFromRank(chunk)

          ops.push(new Put(
            ranked(uri),
            countFromRank(chunk)
          ))

          count++

          cb()
        }
      }),
      error => {
        if (error) {
          return cb(error)
        }

        db.batch(ops, databaseError => {
          cb(databaseError, count)
        })
      }
    )
  })
}
