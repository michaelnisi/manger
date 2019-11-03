'use strict'

// db - reads and writes data

const keyEncoding = require('charwise')
const level = require('level')
const rank = require('./rank')
const schema = require('./schema')
const { debuglog } = require('util')

const debug = debuglog('manger')

module.exports = {
  createLevelDB,
  flushCounter,
  getETag,
  getFeed,
  has,
  remove,
  resetRanks
}

function createLevelDB (name, cacheSize = 8 * 1024 * 1024) {
  debug('creating database: %s', name)

  return level(name, {
    keyEncoding: keyEncoding,
    cacheSize: cacheSize
  })
}

function getFeed (db, uri, cb) {
  debug('getting feed: %s', uri)

  const key = schema.feed(uri)

  db.get(key, cb)
}

function getETag (db, uri, cb) {
  debug('getting ETag: %s', uri)

  const key = schema.etag(uri)

  db.get(key, cb)
}

function has (db, uri, cb) {
  getETag(db, uri, (er, etag) => {
    if (cb) cb(er)
  })
}

function remove (db, uri, cb) {
  debug('removing feed: %s', uri)

  has(db, uri, (er) => {
    if (er) {
      return cb ? cb(er) : null
    }

    const done = (er) => {
      keys.removeListener('data', ondata)
      keys.removeListener('end', onend)
      keys.removeListener('error', onerror)

      const error = () => {
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

    const onerror = (er) => {
      done(er)
    }

    const ondata = (chunk) => {
      batch.del(chunk)
    }

    const onend = () => {
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
  debug('flushing counter')

  rank(db, counter, (er, count) => {
    if (!er) counter.reset()
    if (cb) cb(er, count)
  })
}

function resetRanks (db, cb) {
  debug('resetting ranks')

  const keys = db.createKeyStream(schema.allRanks)
  const batch = db.batch()

  const done = (er) => {
    keys.removeListener('end', onend)
    keys.removeListener('readable', read)
    keys.removeListener('error', onerror)

    const error = () => {
      if (er) {
        return new Error('failed to reset ranks: ' + er.message)
      }
    }
    if (cb) cb(error())
  }

  const onend = (er) => {
    batch.write((er) => {
      done(er)
    })
  }

  const onerror = (er) => {
    done(er)
  }

  const read = () => {
    let key
    while ((key = keys.read()) !== null) {
      batch.del(key)
    }
  }

  keys.on('end', onend)
  keys.on('readable', read)
  keys.once('error', onerror)
}
