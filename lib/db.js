'use strict'

const schema = require('./schema')
const rank = require('./rank')

exports.flushCounter = flushCounter
exports.getETag = getETag
exports.getFeed = getFeed
exports.has = has
exports.remove = remove
exports.resetRanks = resetRanks

function getFeed (db, uri, cb) {
  const key = schema.feed(uri)
  db.get(key, cb)
}

function getETag (db, uri, cb) {
  const key = schema.etag(uri)
  db.get(key, cb)
}

function has (db, uri, cb) {
  getETag(db, uri, (er, etag) => {
    if (cb) cb(er)
  })
}

function remove (db, uri, cb) {
  has(db, uri, (er) => {
    if (er) {
      return cb ? cb(er) : null
    }
    function done (er) {
      keys.removeListener('data', ondata)
      keys.removeListener('end', onend)
      keys.removeListener('error', onerror)
      function error () {
        if (er) {
          return new Error('failed to remove: ' + er.message)
        }
      }
      if (cb) cb(error())
    }
    const opts = schema.entries(uri, 0)
    const keys = db.createKeyStream(opts)
    const batch = db.batch()

    batch.del(schema.etag(uri))
    batch.del(schema.feed(uri))

    function onerror (er) {
      done(er)
    }
    function ondata (chunk) {
      batch.del(chunk)
    }
    function onend () {
      const ranked = schema.ranked(uri)
      db.get(ranked, (er, count) => {
        if (er && !er.notFound) {
          return done(er)
        }
        const c = parseInt(count)
        if (!isNaN(c)) {
          const rank = schema.rank(uri, c)
          batch.del(rank)
          batch.del(ranked)
        }
        batch.write((er) => {
          done(er)
        })
      })
    }
    keys.on('data', ondata)
    keys.on('end', onend)
    keys.on('error', onerror)
  })
}

function flushCounter (db, counter, cb) {
  rank(db, counter, (er, count) => {
    if (!er) counter.reset()
    if (cb) cb(er, count)
  })
}

function resetRanks (db, cb) {
  const keys = db.createKeyStream(schema.allRanks)
  const batch = db.batch()
  function done (er) {
    keys.removeListener('end', onend)
    keys.removeListener('readable', read)
    keys.removeListener('error', onerror)
    function error () {
      if (er) {
        return new Error('failed to reset ranks: ' + er.message)
      }
    }
    if (cb) cb(error())
  }
  function onend (er) {
    batch.write((er) => {
      done(er)
    })
  }
  function onerror (er) {
    done(er)
  }
  function read () {
    let key
    while ((key = keys.read()) !== null) {
      batch.del(key)
    }
  }
  keys.on('end', onend)
  keys.on('readable', read)
  keys.once('error', onerror)
}
