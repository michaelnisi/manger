'use strict'

module.exports = {
  createManger,
  teardown
}

const assert = require('assert')
const rimraf = require('rimraf')
const { Manger, createLevelDB } = require('../../')
const { defaults } = require('../../lib/init')

/**
 * Returns a new Manger object initialized with `custom` options.
 */
function createManger (custom) {
  const name = '/tmp/manger-' + Math.floor(Math.random() * (1 << 24))
  const opts = defaults(custom)
  const db = createLevelDB(name)

  return new Manger(db, opts)
}

function teardown (cache, cb) {
  const { db } = cache
  assert(db)

  db.close((er) => {
    if (er) throw er

    const { _db: { db: { location } } } = db

    rimraf(location, (er) => {
      if (er) throw er
      cb()
    })
  })
}
