'use strict'

// streams - we love streams

const bytewise = require('bytewise')
const schema = require('./schema')
const { MangerTransform } = require('./streams_base')
const { Opts } = require('./conf')
const { Transform } = require('readable-stream')
const { getFeed } = require('./db')
const { inherits } = require('util')

exports.Entries = Entries
exports.FeedURLs = FeedURLs
exports.Feeds = Feeds
exports.Opts = Opts
exports.RankURLs = RankURLs
exports.URLs = URLs
exports.cp = cp
exports.list = list
exports.ranks = ranks
exports.update = update

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
  const uri = qry.uri()

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
  const opts = schema.entries(qry.uri(), qry.since, true)
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
  const key = bytewise.decode(chunk)
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
  const uri = schema.URIFromRank(chunk)
  if (!this.push(uri)) {
    this.once('drain', cb)
  } else {
    cb()
  }
}

// Returns a Readable stream of feed URLs in ranked order, popular first.
function ranks (db, opts, limit) {
  const keys = db.createKeyStream(schema.ranks(limit))
  const ranks = new RankURLs(cp(opts))

  function onend () {
    keys.removeListener('end', onend)
    keys.removeListener('error', onerror)
    ranks.end()
    ranks.removeListener('drain', ondrain)
  }

  function onerror (er) {
    ranks.emit('error', er)
    onend()
  }

  let ok = true

  function write () {
    let chunk
    while (ok && (chunk = keys.read()) !== null) {
      ok = ranks.write(chunk)
    }
    if (!ok) ranks.once('drain', ondrain)
  }

  function ondrain () {
    ok = true
    write()
  }

  keys.on('end', onend)
  keys.on('readable', write)
  keys.once('error', onerror)

  return ranks
}

// Updates all feeds in ranked order, hot feeds first, and returns a readable
// stream of updated feeds. Using ranks as input implies that `flushCounter`  has
// been run at least once before update has any effect.
function update (db, opts) {
  const r = ranks(db, opts)

  const fopts = cp(opts)
  fopts.force = true
  fopts.objectMode = true

  const s = new Feeds(db, fopts)

  let ok = true

  function ondrain () {
    ok = true
    write()
  }

  function write () {
    let chunk
    while (ok && (chunk = r.read()) !== null) {
      ok = s.write(chunk)
    }
    if (!ok) {
      s.once('drain', ondrain)
    }
  }

  // TODO: Review update input stream error handling
  //
  // What does it mean, if the ranks stream emits an error? Do we risk getting
  // stuck here? Should we better abort?
  //
  function onerror (er) {
    const error = new Error('update error: ' + er.message)
    s.emit('error', error)
  }

  function onend () {
    r.removeListener('end', onend)
    r.removeListener('error', onerror)
    r.removeListener('readable', write)

    s.end()
    s.removeListener('drain', ondrain)
  }

  r.once('end', onend)
  r.once('error', onerror)
  r.on('readable', write)

  return s
}

function cp (it) {
  const o = Object.create(null)
  return it ? Object.assign(o, it) : o
}

function list (db, opts) {
  const keys = db.createKeyStream(schema.allFeeds)
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
