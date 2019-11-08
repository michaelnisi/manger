'use strict'

// rank - rank query counts

const { pipeline, Transform, Writable } = require('readable-stream')
const { debuglog } = require('util')
const {
  decode,
  rank,
  URIFromFeed,
  allRanks,
  allFeeds,
  URIFromRank,
  ranked,
  countFromRank,
  ranks
} = require('./schema')

const debug = debuglog('manger')

/**
 * A Transform stream to update the rank index.
 */
class Keys extends Transform {
  /**
   * Creates a new keys stream from `opts` and `snapshot`.
   *
   * @param {*} Plain stream options.
   * @param {*} A set of feeds.
   *
   * A `snapshot` is a set of feeds, eg. { 'http://abc.de': 8, ... },
   * where the property name is the URL of a feed and the value is its
   * access count. The count gets added in the rank calculation.
   */
  constructor (opts, snapshot) {
    super(opts)

    this.snapshot = snapshot
  }

  /**
   * Updates rank index keys considering the counter snapshot.} chunk
   */
  _transform (chunk, enc, cb) {
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

  _flush (cb) {
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

function createSnapshot (uris, counter) {
  debug('creating snapshot: %i', uris.length)

  const snapshot = Object.create(null)

  uris.forEach(uri => { snapshot[uri] = 0 })
  counter.forEach((value, key) => { snapshot[key] = value })

  return snapshot
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
    const snapshot = createSnapshot(all, counter)

    debug('using snapshot: %s', snapshot)

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

// Transforms rank keys to URLs.
class RankURLs extends Transform {
  constructor (opts) {
    super(opts)

    this._readableState.objectMode = opts.objectMode
  }

  _transform (chunk, enc, cb) {
    const uri = URIFromRank(chunk)

    if (!this.push(uri)) {
      this.once('drain', cb)
    } else {
      cb()
    }
  }
}

/**
 * Returns a Readable stream of feed URLs in ranked order, popular first.
 */
function createRankedFeedURLsStream (db, opts, limit) {
  const range = ranks(limit)

  debug('creating key stream: %s', range)

  const keys = db.createKeyStream(range)
  const fopts = opts ? Object.assign(Object.create(null), opts) : null
  const urls = new RankURLs(fopts)

  function onend () {
    keys.removeListener('end', onend)
    keys.removeListener('error', onerror)
    urls.end()
    urls.removeListener('drain', ondrain)
  }

  function onerror (er) {
    urls.emit('error', er)
    onend()
  }

  let ok = true

  function write () {
    debug('keys readable')
    let chunk

    while (ok && (chunk = keys.read()) !== null) {
      debug('read chunk from keys: %s', chunk)
      ok = urls.write(chunk)
    }

    if (!ok) {
      debug('waiting for drain')
      urls.once('drain', ondrain)
    } else {
      debug('no more keys to read')
    }
  }

  function ondrain () {
    ok = true
    write()
  }

  keys.on('end', onend)
  keys.on('readable', write)
  keys.once('error', onerror)

  return urls
}

module.exports = {
  updateFeedRanking,
  Keys,
  allFeedURLs,
  createRankedFeedURLsStream,
  RankURLs
}
