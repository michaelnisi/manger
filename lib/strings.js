// strings - transform stringy things
// @ts-check

const crypto = require('crypto');
const path = require('path');
const sanitize = require('html-reduce');
const {URL} = require('url');

module.exports = {
  duration,
  entryID,
  entryLink,
  hash,
  html,
};

function html(str) {
  if (typeof str !== 'string') {
    return null;
  }

  return sanitize(str);
}

function duration(str) {
  if (typeof str !== 'string' || str === '') {
    return null;
  }

  const tokens = str.split(':').slice(0, 3);
  const m = Math.pow(60, tokens.length - 1);

  const [result] = tokens.reduce(
    (acc, token) => {
      const [s, x] = acc;
      return [s + Number(token) * x, x / 60];
    },
    [0, m],
  );

  return isNaN(result) || result === 0 ? null : result;
}

function hash(str) {
  return crypto
    .createHash('sha1')
    .update(str)
    .digest('hex');
}

function entryID(entry) {
  if (!entry) {
    return null;
  }

  const feed = entry.url;
  if (typeof feed !== 'string') {
    return null;
  }

  const id = entry.id || entry.link || entry.title;
  if (typeof id !== 'string') {
    return null;
  }

  return hash(`${feed}${id}`);
}

const entryLinkWhiteList = new Set(['', '.html', '.htm']);

function entryLink(entry) {
  if (!entry) {
    return null;
  }

  const link = entry.link;
  if (typeof link !== 'string') {
    return null;
  }

  const media = entry.enclosure ? entry.enclosure.url : null;
  if (link === media) {
    return null;
  }

  try {
    const p = new URL(link).pathname;
    const ext = path.extname(p);
    if (!entryLinkWhiteList.has(ext)) {
      return null;
    }
  } catch (error) {
    return null;
  }

  return link;
}
