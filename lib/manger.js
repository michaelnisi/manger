const lru = require('lru-cache')
const { Entries, Feeds, createRankedFeedURLsStream, update, list } = require('./streams')
const { EventEmitter } = require('events')
const { defaults } = require('./init')
const { inherits, debuglog } = require('util')
const {
  flushCounter,
  has,
  remove,
  resetRanks
} = require('./db')

const debug = debuglog('manger')

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
  return createRankedFeedURLsStream(this.db, this.opts, limit)
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
    const k = qry.uri
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

Manger.prototype.update = function (cb) {
  return update(this.db, this.opts, cb)
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

exports.Manger = Manger
