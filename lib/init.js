'use strict'

// init - configure manger

module.exports = {
  Opts,
  defaults
}

const nop = () => {}

function Opts (
  cacheSize = 16 * 1024 * 1024,
  counterMax = 500,
  failures = { set: nop, get: nop, has: nop },
  force = false,
  highWaterMark,
  isEntry = (entry) => { return true },
  isFeed = (feed) => { return true },
  objectMode = false,
  redirects = { set: nop, get: nop, has: nop }
) {
  this.cacheSize = cacheSize
  this.counterMax = counterMax
  this.failures = failures
  this.force = force
  this.highWaterMark = highWaterMark
  this.isEntry = isEntry
  this.isFeed = isFeed
  this.objectMode = objectMode
  this.redirects = redirects
}

function defaults (opts = Object.create(null)) {
  if (opts instanceof Opts) return opts

  return new Opts(
    opts.cacheSize,
    opts.counterMax,
    opts.failures,
    opts.force,
    opts.highWaterMark,
    opts.isEntry,
    opts.isFeed,
    opts.objectMode,
    opts.redirects
  )
}
