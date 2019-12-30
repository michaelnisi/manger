// manger - the main class
// @ts-check

const lru = require('lru-cache');
const {Entries} = require('./entries');
const {Feeds, update, list} = require('./feeds');
const {createRankedFeedURLsStream} = require('./ranking');
const {EventEmitter} = require('events');
const {defaults} = require('./init');
const {debuglog} = require('util');
const {flushCounter, has, remove, resetRanks} = require('./db');

const debug = debuglog('manger');

class Manger extends EventEmitter {
  constructor(db, opts) {
    debug('initializing');
    super();

    this._db = db;
    this.opts = defaults(opts);
    this.opts.failures = lru({max: 500, maxAge: 36e5 * 24});
    this.opts.redirects = lru({max: 500, maxAge: 36e5 * 24});
    this.counter = lru({max: this.opts.counterMax});
  }

  get db() {
    if (!this._db || this._db.isClosed()) {
      this.emit('error', new Error('no database'));

      return null;
    } else {
      return this._db;
    }
  }

  ranks(limit) {
    return createRankedFeedURLsStream(this.db, this.opts, limit);
  }

  resetRanks(cb) {
    return resetRanks(this.db, cb);
  }

  feeds() {
    return new Feeds(this.db, this.opts);
  }

  entries() {
    const s = new Entries(this.db, this.opts);

    const onhit = qry => {
      const k = qry.uri;
      let c = this.counter.peek(k) || 0;

      this.counter.set(k, ++c);
      this.emit('hit', qry);
    };

    const deinit = () => {
      s.removeListener('error', deinit);
      s.removeListener('finish', deinit);
      s.removeListener('hit', onhit);
    };

    s.once('error', deinit);
    s.once('finish', deinit);
    s.on('hit', onhit);

    return s;
  }

  flushCounter(cb) {
    return flushCounter(this.db, this.counter, cb);
  }

  update(cb) {
    return update(this.db, this.opts, cb);
  }

  list() {
    return list(this.db);
  }

  has(uri, cb) {
    return has(this.db, uri, cb);
  }

  remove(uri, cb) {
    return remove(this.db, uri, cb);
  }
}

module.exports = {
  Manger,
};
