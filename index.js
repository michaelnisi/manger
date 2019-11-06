'use strict'

// manger - cache feeds

exports = module.exports = Manger

const lru = require('lru-cache')
const query = require('./lib/query')
const { Entries, Feeds, URLs, FeedURLs, ranks, update, list } = require('./lib/streams')
const { EventEmitter } = require('events')
const { defaults, Opts } = require('./lib/init')
const { inherits, debuglog } = require('util')

const {
  flushCounter,
  has,
  remove,
  resetRanks,
  createLevelDB
} = require('./lib/db')

const debug = debuglog('manger')

exports.Entries = Entries
exports.FeedURLs = FeedURLs
exports.Feeds = Feeds
exports.Opts = Opts
exports.Queries = query.Queries
exports.URLs = URLs
exports.query = query
exports.Manger = Manger
exports.createLevelDB = createLevelDB

// Creates a new Manger cache, the API of this package.
//
// Failures and temporary redirects live 24 hours.
function Manger (db, opts) {
  if (!(this instanceof Manger)) return new Manger(db, opts)
  EventEmitter.call(this)

  debug('initializing')

  this.opts = defaults(opts)
  this.opts.failures = lru({ max: 500, maxAge: 36e5 * 24 })
  this.opts.redirects = lru({ max: 500, maxAge: 36e5 * 24 })
  this.counter = lru({ max: this.opts.counterMax })

  Object.defineProperty(this, 'db', { get: () => {
    if (!db || db.isClosed()) {
      this.emit('error', new Error('no database'))
    } else {
      return db
    }
  } })
}

inherits(Manger, EventEmitter)

// A readable stream of ranked URIs.
Manger.prototype.ranks = function (limit) {
  return ranks(this.db, this.opts, limit)
}

Manger.prototype.resetRanks = function (cb) {
  return resetRanks(this.db, cb)
}

Manger.prototype.feeds = function () {
  return new Feeds(this.db, this.opts)
}

Manger.prototype.entries = function () {
  const s = new Entries(this.db, this.opts)

  const onhit = (qry) => {
    const k = qry.uri()
    let c = this.counter.peek(k) || 0
    this.counter.set(k, ++c)
    this.emit('hit', qry)
  }

  function deinit () {
    s.removeListener('error', deinit)
    s.removeListener('finish', deinit)
    s.removeListener('hit', onhit)
  }

  s.once('error', deinit)
  s.once('finish', deinit)
  s.on('hit', onhit)

  return s
}

Manger.prototype.flushCounter = function (cb) {
  return flushCounter(this.db, this.counter, cb)
}

Manger.prototype.update = function (concurrencyLevel = 1) {
  return update(this.db, this.opts, concurrencyLevel)
}

Manger.prototype.list = function () {
  return list(this.db, this.opts)
}

Manger.prototype.has = function (uri, cb) {
  return has(this.db, uri, cb)
}

Manger.prototype.remove = function (uri, cb) {
  return remove(this.db, uri, cb)
}
