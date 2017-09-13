// common - common test gear

exports.freshDB = freshDB
exports.freshManger = freshManger
exports.teardown = teardown

const levelup = require('levelup')
const manger = require('../../')
const rimraf = require('rimraf')

function freshName () {
  return '/tmp/manger-' + Math.floor(Math.random() * (1 << 24))
}

function freshDB () {
  const name = freshName()
  return levelup(name)
}

function freshManger (opts) {
  const name = freshName()
  return manger(name, opts)
}

function teardown (cache, cb) {
  const db = cache.db
  const p = db.location
  rimraf(p, (er) => {
    if (cb) return cb(er)
    if (er) throw er
  })
}
