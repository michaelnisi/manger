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

// Manger namespace to afford sharing a key value store.
var MANGER = 'manger'

var ENTRY = 'entry'
var ETAG = 'etag'
var FEED = 'feed'
var RANK = 'rank'

function encode (o) {
  return bytewise.encode(o)
}

exports.allFeeds = {
  gte: encode([MANGER, [FEED, null]]),
  lte: encode([MANGER, [FEED, undefined]])
}

exports.allRanks = {
  gte: encode([MANGER, [RANK, 0, null]]),
  lte: encode([MANGER, [RANK, Infinity, undefined]]),
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
  return encode([MANGER, [RANK, count, uri]])
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
  return encode([MANGER, [FEED, uri]])
}

function URIFromFeed (buf) {
  var key = bytewise.decode(buf)
  var uri = key[1][1]
  return uri
}

// - uri String() The entry's feed URI.
// - ts Number() The timestamp of the entry (ms since epoch).
function entry (uri, ts) {
  uri = trim(uri)
  ts = ts || 0
  assert(typeof ts === 'number')
  return encode([MANGER, [ENTRY, uri, ts]])
}

// - uri String() The feed URL
// - ts Number() Entries between now and ts
// - fillCache Boolean() Fill LevelDB cache with these reads
function entries (uri, ts, fillCache) {
  fillCache = fillCache || false
  return {
    gte: entry(uri, ts),
    lte: entry(uri, Infinity),
    fillCache: fillCache
  }
}

// - uri String() The feed URI.
function etag (uri) {
  uri = trim(uri)
  return encode([MANGER, [ETAG, uri]])
}
