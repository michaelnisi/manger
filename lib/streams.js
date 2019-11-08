'use strict'

// streams - we ❤️ streams

const { decode, entries, URIFromRank, ranks, allFeeds } = require('./schema')
const { MangerTransform } = require('./streams_base')
const { Opts } = require('./init')
const { Transform, pipeline, Writable } = require('readable-stream')
const { getFeed } = require('./db')
const { inherits, debuglog } = require('util')

const debug = debuglog('manger')

module.exports = {
  Entries,
  FeedURLs,
  Feeds,
  Opts,
  RankURLs,
  URLs,
  cp,
  list,
  createRankedFeedURLsStream,
  update
}

// A stream of feeds.
function Feeds (db, opts) {
  if (!(this instanceof Feeds)) return new Feeds(db, opts)
  MangerTransform.call(this, db, opts)

  this.pushFeeds = true
  this.pushEntries = false
}

inherits(Feeds, MangerTransform)

Feeds.prototype.retrieve = function (qry, cb) {
  const db = this.db
  const uri = qry.uri

  getFeed(db, uri, (er, val) => {
    if (er) {
      if (!er.notFound) {
        this.emit('error', er)
      }
    } else if (val) {
      this.use(val, qry)
    }
    if (cb) cb()
  })
}

// A stream of entries.
function Entries (db, opts) {
  if (!(this instanceof Entries)) return new Entries(db, opts)
  MangerTransform.call(this, db, opts)

  this.pushFeeds = false
  this.pushEntries = true
}

inherits(Entries, MangerTransform)

Entries.prototype.retrieve = function (qry, cb) {
  const opts = entries(qry.uri, qry.since, true)
  const values = this.db.createValueStream(opts)

  let ok = true

  const use = () => {
    if (!ok) return
    let chunk
    while (ok && (chunk = values.read()) !== null) {
      ok = this.use(chunk, qry)
    }
    if (!ok) {
      this.once('drain', () => {
        ok = true
        use()
      })
    }
  }

  function onend (er) {
    values.removeListener('readable', use)
    values.removeListener('error', onerror)
    values.removeListener('end', onend)
    if (cb) cb(er)
  }

  function onerror (er) {
    let error = new Error('retrieve error: ' + er.message)

    onend(error)
  }

  values.on('readable', use)
  values.on('error', onerror)
  values.on('end', onend)
}

// Transform feed keys to URLs.
function URLs (opts) {
  if (!(this instanceof URLs)) return new URLs(opts)
  Transform.call(this, opts)
}

inherits(URLs, Transform)

URLs.prototype._transform = function (chunk, enc, cb) {
  const key = decode(chunk)
  const uri = key[1][1]

  this.push(uri)
  cb()
}

// Transform feeds to URLs.
function FeedURLs (opts) {
  if (!(this instanceof FeedURLs)) return new FeedURLs(opts)
  Transform.call(this, opts)
}

inherits(FeedURLs, Transform)

FeedURLs.prototype._transform = function (chunk, enc, cb) {
  const uri = chunk.feed

  if (uri) {
    this.push(uri)
  } else {
    this.emit('error', new Error('feed without URL'))
  }

  cb()
}

// Transforms rank keys to URLs.
function RankURLs (opts) {
  if (!(this instanceof RankURLs)) return new RankURLs(opts)
  Transform.call(this, opts)
  this._readableState.objectMode = opts.objectMode
}

inherits(RankURLs, Transform)

RankURLs.prototype._transform = function (chunk, enc, cb) {
  const uri = URIFromRank(chunk)
  if (!this.push(uri)) {
    this.once('drain', cb)
  } else {
    cb()
  }
}

/**
 * Returns a Readable stream of feed URLs in ranked order, popular first.
 */
function createRankedFeedURLsStream (db, opts, limit) {
  const range = ranks(limit)

  debug('creating key stream: %s', range)
  
  const keys = db.createKeyStream(range)
  const urls = new RankURLs(cp(opts))

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
      debug("waiting for drain")
      urls.once('drain', ondrain)
    } else {
      debug("no more keys to read")
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

/**
 * Updates all feeds in ranked order – hot feeds first – and returns a readable
 * stream of updated feeds. Using ranks as input implies that `flushCounter` has
 * been run at least once before updating can have any effect.
 * 
 * @param db The database.
 * @param opts Options for setting up the pipeline.
 * @param cb The callback receives optionally an error and an Array 
 * of updated feed URLs.
 */
function update (db, opts, cb) {
  const fopts = cp(opts)
  fopts.force = true
  fopts.objectMode = true

  debug('updating: ( %s, %s )', db, fopts)

  let updated = []

  pipeline(
    createRankedFeedURLsStream(db, opts),
    new Feeds(db, fopts),
    new Writable({
      write(chunk, enc, cb) {
        updated.push(chunk)
        cb()
      }
    }),
    error => {
      debug('updated: ( %s, %s )', error || 'OK', updated.length)
      cb(error, updated)
    }
  )
}

function cp (it) {
  const o = Object.create(null)
  return it ? Object.assign(o, it) : o
}

function list (db, opts) {
  const keys = db.createKeyStream(allFeeds)
  const uris = new URLs({ objectMode: true })
  let ok = true

  function write () {
    let chunk
    while (ok && (chunk = keys.read()) !== null) {
      ok = uris.write(chunk)
    }
    if (!ok) uris.once('drain', ondrain)
  }

  function ondrain () {
    ok = true
    write()
  }

  function onerror (er) {
    const error = new Error('list error: ' + er.message)

    uris.emit('error', error)
    onend()
  }

  function onend () {
    keys.removeListener('end', onend)
    keys.removeListener('error', onerror)
    keys.removeListener('readable', write)
    uris.removeListener('drain', ondrain)
    uris.end()
  }

  keys.on('end', onend)
  keys.on('error', onerror)
  keys.on('readable', write)

  return uris
}
