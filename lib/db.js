// db - reads and writes data
// @ts-check

const level = require('level');
const {updateFeedRanking} = require('./ranking');
const {
  keyEncoding,
  feed,
  etag,
  entries,
  ranked,
  rank,
  allRanks,
} = require('./schema');
const {pipeline, Writable} = require('readable-stream');
const {debuglog} = require('util');

const debug = debuglog('manger');

module.exports = {
  createLevelDB,
  flushCounter,
  getETag,
  getFeed,
  has,
  remove,
  resetRanks,
};

function createLevelDB(name, cacheSize = 8 * 1024 * 1024) {
  debug('creating database: %s', name);

  return level(name, {
    keyEncoding,
    cacheSize,
  });
}

function getFeed(db, uri, cb) {
  debug('getting feed: %s', uri);

  const key = feed(uri);

  db.get(key, cb);
}

function getETag(db, uri, cb) {
  debug('getting ETag: %s', uri);

  const key = etag(uri);

  db.get(key, cb);
}

function has(db, uri, cb) {
  getETag(db, uri, (er, _etag) => {
    if (cb) {
      cb(er);
    }
  });
}

/**
 * Deletes all keys and values for `uri`.
 *
 * @param {*} db The database.
 * @param {string} uri The URL of the feed.
 * @param {(error) => void} cb The callback receiving an error.
 */
function remove(db, uri, cb) {
  debug('removing feed: %s', uri);

  has(db, uri, er => {
    if (er) {
      cb(er);

      return;
    }

    const batch = db.batch();

    batch.del(etag(uri));
    batch.del(feed(uri));

    pipeline(
      db.createKeyStream(entries(uri, 0)),
      new Writable({
        decodeStrings: false,
        write(chunk, _enc, writeCallback) {
          batch.del(chunk);
          writeCallback();
        },
      }),
      error => {
        if (error) {
          cb(error);

          return;
        }

        const r = ranked(uri);

        db.get(r, (getError, count) => {
          if (getError && !getError.notFound) {
            cb(getError);

            return;
          }

          const c = parseInt(count, 10);

          if (!isNaN(c)) {
            batch.del(rank(uri, c));
            batch.del(r);
          }

          batch.write(writeError => {
            cb(writeError);
          });
        });
      },
    );
  });
}

function flushCounter(db, counter, cb) {
  debug('flushing counter');

  updateFeedRanking(db, counter, (er, count) => {
    debug('feed ranking updated: ( %s, %s )', er || 'OK', count);
    if (!er) {
      counter.reset();
    }
    if (cb) {
      cb(er, count);
    }
  });
}

function resetRanks(db, cb) {
  debug('resetting ranks');

  const batch = db.batch();

  pipeline(
    db.createKeyStream(allRanks),
    new Writable({
      decodeStrings: false,
      write(chunk, _enc, writeCallback) {
        batch.del(chunk);
        writeCallback();
      },
    }),
    error => {
      if (error) {
        cb(error);

        return;
      }

      batch.write(er => {
        cb(er);
      });
    },
  );
}
