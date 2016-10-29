'use strict'

// schema - provide the keys

exports.URIFromFeed = URIFromFeed
exports.URIFromRank = URIFromRank
exports.countFromRank = countFromRank
exports.entries = entries
exports.entry = entry
exports.etag = etag
exports.feed = feed
exports.rank = rank

var assert = require('assert')
var url = require('url')
var bytewise = require('bytewise')

function encode (o) {
  return bytewise.encode(o)
}

exports.allFeeds = {
  gte: encode(['manger', ['feed', null]]),
  lte: encode(['manger', ['feed', undefined]])
}

exports.allRanks = {
  gte: encode(['manger', ['rank', 0, null]]),
  lte: encode(['manger', ['rank', Infinity, undefined]]),
  reverse: true
}

function trim (uri) {
  return url.format(url.parse(uri))
}

// - uri String() The feed URI.
// - count Number() The query count for this URI.
function rank (uri, count) {
  uri = trim(uri)
  assert(typeof count === 'number', 'not a number')
  return encode(['manger', ['rank', count, uri]])
}

function URIFromRank (buf) {
  var key = bytewise.decode(buf)
  var uri = key[1][2]
  return uri
}

function countFromRank (buf) {
  var key = bytewise.decode(buf)
  var count = key[1][1]
  return count
}

// - uri String() The feed URI.
function feed (uri) {
  uri = trim(uri)
  return encode(['manger', ['feed', uri]])
}

function URIFromFeed (buf) {
  var key = bytewise.decode(buf)
  var uri = key[1][1]
  return uri
}

// TODO: Add id to entry key
//
// The current entry key doesn't provide sufficient identification. A direct
// symptome of this shortcoming are doublets, resulting from a feed which has
// republished an entry with the same id but a different updated timestamp.
// Two entries are equal if their ids are equal. A problem here is that ids are
// optional and many feeds don't provide them. Falling back on enclosure URL--than
// link, than title--might be an option in this case.

// - uri String() The entry's feed URI.
// - ts Number() The timestamp of the entry (ms since epoch).
function entry (uri, ts) {
  uri = trim(uri)
  ts = ts || 0
  assert(typeof ts === 'number')
  return encode(['manger', ['entry', uri, ts]])
}

// - uri String() The feed URL
// - ts Number() Entries between now and ts
// - fillCache Boolean() Fill LevelDB cache with these reads
function entries (uri, ts, fillCache) {
  fillCache = fillCache || false
  return {
    gt: entry(uri, ts),
    lte: entry(uri, Infinity),
    fillCache: fillCache
  }
}

// - uri String() The feed URI.
function etag (uri) {
  uri = trim(uri)
  return encode(['manger', ['etag', uri]])
}
