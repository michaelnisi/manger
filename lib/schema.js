'use strict'

// schema - encodes and decodes keys

const assert = require('assert')
const url = require('url')
const { encode, decode } = require('charwise')

const allFeeds = {
  gte: encode(['manger', ['feed', null]]),
  lte: encode(['manger', ['feed', undefined]])
}

const allRanks = {
  gte: encode(['manger', ['rank', 0, null]]),
  lte: encode(['manger', ['rank', Infinity, undefined]]),
  reverse: true
}

module.exports = {
  allFeeds,
  allRanks,
  URIFromFeed,
  URIFromRank,
  countFromRank,
  entries,
  entry,
  etag,
  feed,
  rank,
  ranked,
  ranks
}

function ranks (limit) {
  const opts = Object.assign(Object.create(null), allRanks)
  opts.limit = limit

  return opts
}

function trim (uri) {
  return url.format(url.parse(uri))
}

// - uri String() The feed URI.
// - count Number() The query count for this URI.
function rank (uri, count) {
  assert(typeof count === 'number', 'not a number')
  return encode(['manger', ['rank', count, trim(uri)]])
}

function URIFromRank (buf) {
  const key = decode(buf)
  const uri = key[1][2]

  return uri
}

function ranked (uri) {
  return encode(['manger', ['ranked', trim(uri)]])
}

function countFromRank (buf) {
  const key = decode(buf)
  const count = key[1][1]

  return count
}

// - uri String() The feed URI.
function feed (uri) {
  return encode(['manger', ['feed', trim(uri)]])
}

function URIFromFeed (buf) {
  const key = decode(buf)
  const uri = key[1][1]

  return uri
}

// - uri String() The entry's feed URI.
// - ts Number() The timestamp of the entry (ms since epoch).
function entry (uri, ts = 0, id) {
  assert(typeof uri === 'string')
  assert(typeof ts === 'number')

  const key = encode(['manger', ['entry', trim(uri), ts, id]])

  return key
}

// - uri String() The feed URL
// - ts Number() Entries between now and ts
// - fillCache Boolean() Fill LevelDB cache with these reads
function entries (uri, ts, fillCache = false) {
  return {
    gt: entry(uri, ts, undefined),
    lte: entry(uri, Infinity, undefined),
    fillCache: fillCache
  }
}

// - uri String() The feed URI.
function etag (uri) {
  return encode(['manger', ['etag', trim(uri)]])
}
