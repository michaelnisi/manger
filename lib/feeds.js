// feeds - feeds
// @ts-check

const {decode, allFeeds} = require('./schema');
const {getFeed} = require('./db');
const {MangerTransform} = require('./streams_base');
const {Transform, pipeline, Writable} = require('readable-stream');
const {debuglog} = require('util');
const {createRankedFeedURLsStream} = require('./ranking');

const debug = debuglog('manger');

/**
 * Transforms queries to feeds.
 */
class Feeds extends MangerTransform {
  constructor(db, opts) {
    super(db, opts);

    this.pushFeeds = true;
    this.pushEntries = false;
  }

  retrieve(qry, cb = error => {}) {
    const db = this.db;
    const uri = qry.uri;

    getFeed(db, uri, (er, val) => {
      if (er) {
        cb(!er.notFound ? er : null);

        return;
      }

      if (val) {
        this.use(val, qry);
      }

      cb();
    });
  }
}

/**
 * Transforms feed keys to URLs.
 */
class URLs extends Transform {
  _transform(chunk, enc, cb) {
    const key = decode(chunk);
    const uri = key[1][1];

    this.push(uri);
    cb();
  }
}

/**
 * Transforms feeds to URLs.
 */
class FeedURLs extends Transform {
  _transform(chunk, enc, cb) {
    const uri = chunk.feed;

    if (!uri) {
      cb(new Error('feed without URL'));

      return;
    }

    this.push(uri);
  }
}

/**
 * Updates all feeds in ranked order, hot feeds first. Using ranks as input
 * implies that `flushCounter` ran at least once before updating can have
 * any effect.
 *
 * @param db The database.
 * @param opts Options for setting up the pipeline.
 * @param cb The callback receives an error and an Array of updated feed URLs.
 */
function update(db, opts, cb) {
  const fopts = opts ? Object.assign(Object.create(null), opts) : null;
  fopts.force = true;
  fopts.objectMode = true;
  fopts.delay = 3e3;

  debug('updating: ( %s, %s )', db, fopts);

  const updated = [];

  pipeline(
    createRankedFeedURLsStream(db, opts),
    new Feeds(db, fopts),
    new Writable({
      objectMode: true,
      write(chunk, _enc, writeCallback) {
        updated.push(chunk);
        writeCallback();
      },
    }),
    error => {
      debug('updated: ( %o, %s )', error || 'OK', updated.length);
      cb(error, updated);
    },
  );
}

function list(db) {
  const keys = db.createKeyStream(allFeeds);
  const uris = new URLs({objectMode: true});
  let ok = true;

  function write() {
    let chunk;
    while (ok && (chunk = keys.read()) !== null) {
      ok = uris.write(chunk);
    }
    if (!ok) {
      uris.once('drain', ondrain);
    }
  }

  function ondrain() {
    ok = true;
    write();
  }

  function onerror(er) {
    uris.emit('error', new Error('list error: ' + er.message));
    onend();
  }

  function onend() {
    keys.removeListener('end', onend);
    keys.removeListener('error', onerror);
    keys.removeListener('readable', write);
    uris.removeListener('drain', ondrain);
    uris.end();
  }

  keys.on('end', onend);
  keys.on('error', onerror);
  keys.on('readable', write);

  return uris;
}

module.exports = {
  Feeds,
  URLs,
  FeedURLs,
  update,
  list,
};
