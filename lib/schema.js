// schema - encodes and decodes keys
// @ts-check

const assert = require('assert');
const {URL, format} = require('url');
const keyEncoding = require('charwise');

const {encode, decode} = keyEncoding;

const allFeeds = {
  gte: encode(['manger', ['feed', null]]),
  lte: encode(['manger', ['feed', undefined]]),
};

const allRanks = {
  gte: encode(['manger', ['rank', 0, null]]),
  lte: encode(['manger', ['rank', Infinity, undefined]]),
  reverse: true,
};

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
  ranks,
  decode,
  encode,
  keyEncoding,
};

function ranks(limit) {
  const opts = Object.assign(Object.create(null), allRanks);
  opts.limit = limit;

  return opts;
}

function trim(uri) {
  return format(new URL(uri));
}

// - uri String() The feed URI.
// - count Number() The query count for this URI.
function rank(uri, count) {
  assert(typeof count === 'number', 'not a number');
  return encode(['manger', ['rank', count, trim(uri)]]);
}

function URIFromRank(string) {
  const key = decode(string);
  const uri = key[1][2];

  return uri;
}

function ranked(uri) {
  return encode(['manger', ['ranked', trim(uri)]]);
}

function countFromRank(string) {
  const key = decode(string);
  const count = key[1][1];

  return count;
}

// - uri String() The feed URI.
function feed(uri) {
  return encode(['manger', ['feed', trim(uri)]]);
}

function URIFromFeed(string) {
  const key = decode(string);
  const uri = key[1][1];

  return uri;
}

/**
 * Returns the key of a specific entry.
 *
 * @param {string} uri The entry's feed URI.
 * @param {number} ts The timestamp of the entry (ms since epoch).
 * @param {string} id The hash of the entry.
 */
function entry(uri, ts = 0, id) {
  assert(typeof uri === 'string');
  assert(typeof ts === 'number');

  const key = encode(['manger', ['entry', trim(uri), ts, id]]);

  return key;
}

/**
 * Returns key range for entries of feed `uri` newer than `ts`.
 *
 * @param {string} uri The feed URL.
 * @param {number} ts Entries between now and ts.
 * @param {boolean} fillCache Fill LevelDB cache with these reads.
 */
function entries(uri, ts, fillCache = false) {
  return {
    gt: entry(uri, ts, undefined),
    lte: entry(uri, Infinity, undefined),
    fillCache,
  };
}

/**
 * Returns key of the last ETag of `uri`.
 *
 * @param {string} uri The feed URI.
 */
function etag(uri) {
  return encode(['manger', ['etag', trim(uri)]]);
}
