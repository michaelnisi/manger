// streams_base - streaming IO
// @ts-check

const assert = require('assert');
const headary = require('headary');
const http = require('http');
const https = require('https');
const pickup = require('pickup');
const {Query} = require('./query');
const schema = require('./schema');
const strings = require('./strings');
const zlib = require('zlib');
const {StringDecoder} = require('string_decoder');
const {Transform} = require('readable-stream');
const {defaults} = require('./init');
const {debuglog} = require('util');
const {remove, getETag} = require('./db');

const debug = debuglog('manger');

function sameEtag(qry, res) {
  const a = qry.etag;
  const b = res.headers.etag;

  return !!a && !!b && a === b;
}

/**
 * A String used to cache failed requests. The `method` is necessary to
 * differentiate `GET` and `HEAD` requests.
 */
function failureKey(method, uri) {
  assert(typeof method === 'string', `expected string: ${method}`);
  assert(typeof uri === 'string', `expected string: ${uri}`);

  return method + '-' + uri;
}

/**
 * A redirect consisting of HTTP status code and new URL.
 */
function Redirect(code, url) {
  this.code = code;
  this.url = url;
}

function shouldRequestHead(qry) {
  return !!qry.etag && qry.etag !== 'NO_ETAG';
}

const blacklist = RegExp(
  [
    'ENOTFOUND',
    // TODO: Add more errors after which to abort after HEAD
  ].join('|'),
  'i',
);

/**
 * Returns processed `query` within `ctx`.
 *
 * @param {*} ctx A Manger Transform stream.
 * @param {Query | string | Buffer | object} qry The query to process.
 */
function processQuery(ctx, qry) {
  let q = qry;

  if (!qry) {
    throw new Error('query expected');
  }

  if (!(q instanceof Query)) {
    if (q instanceof Buffer) {
      q = ctx.decoder.write(q);
    }
    if (typeof q === 'string') {
      q = new Query({url: q});
    } else {
      // plain objects are fine too
      const {url, since, etag, force} = q;
      q = new Query({url, since, etag, force});
    }
  }

  if (q) {
    if (ctx.force) {
      q.force = true;
    }
    const r = ctx.redirects.get(q.url);

    if (r instanceof Redirect) {
      return q.redirect(r.code, r.url);
    }
  }

  return q;
}

function charsetFromResponse(res) {
  if (!res) {
    return null;
  }

  let a;

  if (typeof res.getHeader === 'function') {
    a = res.getHeader('content-type');
  } else if (!res.headers) {
    return null;
  } else {
    a = res.headers['content-type'];
  }

  if (typeof a !== 'string') {
    return null;
  }

  const b = a.split('charset')[1];

  if (typeof b !== 'string') {
    return null;
  }

  const c = b.split('=')[1];

  if (typeof c !== 'string') {
    return null;
  }

  return c.trim();
}

function PickupOpts(charset) {
  this.charset = charset;
  this.eventMode = true;
}

/**
 * Returns normalized updated timestamp from `thing`.
 */
function time(thing) {
  return Query.time(thing.updated);
}

function newer(item, qry) {
  const a = item.updated;
  const b = qry.since;

  return b === 0 || a > b;
}

/**
 * Abstract base class of feed and entry streams.
 */
class MangerTransform extends Transform {
  constructor(db, opts) {
    const o = defaults(opts);

    super({highWaterMark: o.highWaterMark});

    this.counterMax = o.counterMax;
    this.delay = o.delay;
    this.failures = o.failures;
    this.force = o.force;
    this.isEntry = o.isEntry;
    this.isFeed = o.isFeed;
    this.redirects = o.redirects;

    this._readableState.objectMode = o.objectMode;
    this._writableState.objectMode = true;

    this.db = db;
    this.decoder = new StringDecoder('utf8');
    this.state = 0;
  }

  _flush(cb) {
    if (!this._readableState.objectMode) {
      const chunk = this.state === 0 ? '[]' : ']';

      this.push(chunk);
    }

    this.failures = null;
    this.redirects = null;
    this.db = null;
    this.decoder = null;

    if (cb) {
      cb();
    }
  }

  retrieve(qry, cb) {
    throw new Error('no implemented');
  }

  /**
   * A central method for pushing buffers or objects. Additionally, takes the
   * current query for handling redirects.
   *
   * **Always go through here, never push directly!**
   */
  use(chunk, qry) {
    const uri = qry.uri;
    const originalURL = qry.originalURL;

    // While handling redirects and when in `objectMode`, we have to parse `chunk`.
    // The data, we’re trying to parse though, comes from within our own system,
    // should it be corrupt and thus `JSON` failing to parse it, we got nothing
    // and better crash. But we hardly ever parse at all and rarely stringify.

    let it;
    let isObject = typeof chunk === 'object';
    let data = chunk;

    if (this._readableState.objectMode) {
      it = isObject ? data : JSON.parse(data);
      it.url = uri;
      it.originalURL = originalURL;
    } else {
      if (originalURL) {
        if (!isObject) {
          isObject = true;
          data = JSON.parse(data);
          data.url = uri;
          data.originalURL = originalURL;
        }
      }

      const chars = ['[', ','];
      if (isObject) {
        it = chars[this.state] + JSON.stringify(data);
      } else {
        // main route
        it = chars[this.state] + data;
      }

      if (this.state === 0) {
        this.state = 1;
      }
    }

    return this.push(it);
  }

  httpModule(name) {
    switch (name) {
      case 'http:':
        return http;
      case 'https:':
        return https;
      default:
        return null;
    }
  }

  head(qry, cb = (error, response) => {}) {
    const opts = qry.request('HEAD');

    const mod = this.httpModule(opts.protocol);

    if (!mod) {
      cb(new Error('invalid protocol'));

      return;
    }

    function headResponse(res) {
      function next(er, response) {
        res.removeListener('error', responseError);
        res.removeListener('end', responseEnd);
        done(er, response);
      }
      function responseEnd() {
        next(null, res);
      }
      function responseError(er) {
        next(er);
      }
      res.once('end', responseEnd);
      res.once('error', responseError);

      res.resume(); // to dismiss eventual body
    }

    function done(er, res) {
      req.removeListener('aborted', requestAborted);
      req.removeListener('error', requestError);
      req.removeListener('response', headResponse);
      cb(er, res);
    }

    const req = mod.request(opts, headResponse);

    const requestError = er => {
      const key = failureKey('HEAD', qry.url);

      this.failures.set(key, er.message);
      done(er);
    };

    function requestAborted() {
      // @ts-ignore
      if (req.res && req.res.complete) {
        return;
      }

      const er = new Error('aborted');

      done(er);
    }

    req.once('error', requestError);
    req.once('aborted', requestAborted);

    req.end();
  }

  /**
   * Issues HTTP or HTTPS request for query and receives the response, applying
   * the callback when the received body has been parsed and stored.
   */
  _request(qry, cb = (error, response) => {}) {
    const opts = qry.request();
    const mod = this.httpModule(opts.protocol);

    if (!mod) {
      cb(new Error('invalid protocol'));

      return;
    }

    const req = mod.get(opts);

    function removeListeners() {
      req.removeListener('error', onRequestError);
      req.removeListener('response', onResponse);
      req.removeListener('timeout', onTimeout);

      onParse = onRemove = onRemoveAfterRedirect = null;
    }

    let done = er => {
      removeListeners();
      cb(er && !er.notFound ? er : null);

      done = () => {
        debug('done more than once: %o', opts);
      };
    };

    // Managing the request

    const onRequestError = er => {
      debug('aborting request: %o', er);

      const key = failureKey('GET', qry.url);

      this.failures.set(key, er.message);

      // Without direct access to the parser, we prevent pushing after EOF with
      // these two rascals. We are MangerTransform.
      this.pushFeeds = false;
      this.pushEntries = false;

      req.abort();
      done(er);
    };

    req.once('error', onRequestError);

    // Monitoring the socket

    const onTimeout = () => {
      debug('socket timeout: %s', opts.hostname);
      req.abort();
    };

    req.once('timeout', onTimeout);
    req.setTimeout(5e3);

    // Receiving the response

    let onParse = er => {
      done(er);
    };
    let onRemove = er => {
      done(er);
    };
    let onRemoveAfterRedirect; // defined later, so we can cleanup its scope

    const onResponse = res => {
      const h = headary(res);

      if (h.ok) {
        this.parse(qry, res, onParse);

        return;
      }

      res.resume(); // to dismiss body

      if (h.message) {
        const key = failureKey('GET', qry.url);

        this.failures.set(key, h.message);
        done(new Error(h.message));

        return;
      }

      if (h.url) {
        const code = h.permanent ? 301 : 302;
        const nq = qry.redirect(code, h.url);

        if (!nq) {
          done(new Error(`too many redirects: ${opts}`));

          return;
        }

        this.redirects.set(nq.originalURL, new Redirect(nq.code, nq.url));

        if (h.permanent) {
          // permanent redirect
          onRemoveAfterRedirect = er => {
            if (er && !er.notFound) {
              this.emit('error', er);
            }
            removeListeners();
            this.request(nq, cb);
          };

          remove(this.db, qry.url, onRemoveAfterRedirect);

          return;
        } else {
          // temporary redirect
          removeListeners();
          this.request(nq, cb);

          return;
        }
      }

      if (h.permanent) {
        // gone
        remove(this.db, qry.url, onRemove);
      } else {
        removeListeners();
        this.retrieve(qry, cb);
      }
    };

    req.once('response', onResponse);
  }

  /**
   * Returns true if the `uri` should be ignored, `method` is used to distinct GET
   * and HEAD request, accepting that some servers aren’t implementing HTTP HEAD
   * properly.
   */
  ignore(method, uri) {
    const key = failureKey(method, uri);

    /** @type {boolean} */
    const has = this.failures.has(key);

    if (has) {
      debug('ignoring: %s', uri);
    }

    return has;
  }

  request(qry, cb) {
    debug('requesting: %s', qry.url);

    const done = er => {
      if (cb) {
        cb(er);
      }
    };

    if (this.ignore('GET', qry.url)) {
      done();
    } else if (shouldRequestHead(qry)) {
      if (this.ignore('HEAD', qry.url)) {
        done();

        return;
      }

      this.head(qry, (er, res) => {
        if (er) {
          const msg = er.message;

          if (msg.match(blacklist) !== null) {
            const uri = qry.url;
            const key = failureKey('HEAD', uri);

            this.failures.set(key, er.message);
            remove(this.db, uri, removeError => {
              done(removeError && !removeError.notFound ? removeError : null);
            });

            return;
          }

          this._request(qry, cb);

          return;
        }

        const h = headary(res);

        if (h.ok) {
          if (sameEtag(qry, res)) {
            done();

            return;
          } else {
            this._request(qry, cb);

            return;
          }
        }

        if (h.message) {
          debug('falling back on GET after HEAD message: %s', h.message);

          // We cannot assume that the remote server is handling HEAD requests
          // correctly, therefor we hit it again with a GET to find out what’s
          // going on. Our GET handler will eventually emit the error.

          this._request(qry, cb);

          return;
        }

        if (h.url) {
          const code = h.permanent ? 301 : 302;
          const nq = qry.redirect(code, h.url);
          if (!nq) {
            done(new Error('too many redirects'));

            return;
          }

          // It gets fuzzy here: Should we set a redirect?
          // this.redirects.set(nq.originalURL, new Redirect(nq.code, nq.url))

          if (h.permanent) {
            // permanent redirect
            remove(this.db, qry.url, removeError => {
              if (removeError && !removeError.notFound) {
                this.emit('error', removeError);
              }
              this.request(nq, cb);
            });

            return;
          } else {
            // temporary redirect
            this.request(nq, cb);

            return;
          }
        }

        if (h.permanent) {
          // gone
          remove(this.db, qry.url, removeError => {
            done(removeError && !removeError.notFound ? removeError : null);
          });
        } else {
          done();
        }
      });
    } else {
      this._request(qry, cb);
    }
  }

  /**
   * Processes a query – only critical errors reach the callback.
   *
   * Throttling remote requests, for Gzipping and HTML-santizing utilize
   * too much CPU. Streams that update many (all) feeds at once get extended
   * to longer time periods spreading the load. We learn, streams cannot
   * really be used as queues.
   *
   * @param {Query} q
   * @param {*} _enc
   * @param {*} cb
   */
  _transform(q, _enc, cb) {
    let qry;

    try {
      qry = processQuery(this, q);
    } catch (error) {
      cb(error);

      return;
    }

    const uri = qry.uri;

    getETag(this.db, uri, (er, etag) => {
      if (er && !er.notFound) {
        cb(er);

        return;
      }

      qry.etag = etag;
      const useCached = !qry.force && qry.etag;

      if (useCached) {
        this.emit('hit', qry);
        this.retrieve(qry, cb);
      } else {
        if (typeof this.delay === 'number' && this.delay !== 0) {
          debug('delaying request: %s', this.delay);

          // During updates we delay requests.
          setTimeout(() => {
            this.request(qry, error => {
              if (error) {
                debug('query error: ( %o, %o )', qry, error);
              }

              cb();
            });
          }, this.delay);

          return;
        }

        // Ordinary requests are issued after I/O events' callbacks.
        setImmediate(() => {
          this.request(qry, error => {
            if (error) {
              debug('query error: ( %o, %o )', qry, error);
            }

            cb();
          });
        });
      }
    });
  }

  uid(uri) {
    return [this.db.location, uri].join('~');
  }

  createOnFeedCallback({uri, originalURL, batch, rest, qry}) {
    return feed => {
      try {
        if (!this.isFeed(feed)) {
          debug('invalid feed: %o', feed);

          return;
        }

        let ok = true;

        feed.url = uri;
        feed.originalURL = originalURL;

        feed.updated = Math.max(time(feed), 1);
        feed.summary = strings.html(feed.summary);

        const [k, v] = [schema.feed(uri), JSON.stringify(feed)];

        batch.put(k, v);

        if (!ok) {
          rest.push(feed);
        } else if (this.pushFeeds) {
          ok = this.use(feed, qry);
        }
      } catch (error) {
        debug('unexpected feed: ( %s, %o, %o )', uri, feed, error);
      }
    };
  }

  createOnEntryCallback({uri, originalURL, batch, rest, qry}) {
    return entry => {
      try {
        let ok = true;

        entry.url = uri;
        entry.originalURL = originalURL;

        entry.updated = Math.max(time(entry), 1);

        // Parsing the summary HTML makes this the hottest frame.
        entry.summary = strings.html(entry.summary);

        entry.duration = strings.duration(entry.duration);
        entry.id = strings.entryID(entry);
        entry.link = strings.entryLink(entry);

        if (!this.isEntry(entry)) {
          debug('invalid entry: %o', entry);

          return;
        }

        const {id, updated} = entry;
        const [k, v] = [schema.entry(uri, updated, id), JSON.stringify(entry)];

        batch.put(k, v);

        if (!ok) {
          rest.push(entry);
        } else if (this.pushEntries && newer(entry, qry)) {
          ok = this.use(entry, qry);
        }
      } catch (error) {
        debug('unexpected entry: ( %s, %o, %o )', uri, entry, error);
      }
    };
  }

  /**
   * Parses response body for feeds and entries, unzipping it if necessary and
   * saves the found feeds and entries to the database. When finished, the
   * callback is applied. Usually without an error, for not aborting the stream,
   * just because a single query failed.
   *
   * Run with `NODE_DEBUG=manger` to trace parse errors.
   */
  parse(qry, res, cb = error => {}) {
    const uri = qry.uri;
    const originalURL = qry.originalURL;
    const rest = [];
    const batch = this.db.batch();

    const onFeed = this.createOnFeedCallback({
      uri,
      originalURL,
      batch,
      rest,
      qry,
    });

    const onEntry = this.createOnEntryCallback({
      uri,
      originalURL,
      batch,
      rest,
      qry,
    });

    const charset = charsetFromResponse(res);
    const opts = new PickupOpts(charset);

    /** @type {*} */
    const parser = pickup(opts);

    parser.on('entry', onEntry);
    parser.once('feed', onFeed);

    let done = er => {
      res.removeListener('aborted', onAborted);

      parser.removeListener('entry', onEntry);
      parser.removeListener('feed', onFeed);

      cb(er);

      done = () => {
        debug('** done more than once');
      };
    };

    const onAborted = () => {
      debug('request aborted: %s', uri);

      // https://github.com/nodejs/node/issues/18756
      if (res.complete) {
        return;
      }

      done();
    };

    res.once('aborted', onAborted);

    const dispose = (disposeCallback = () => {}) => {
      const write = () => {
        let it;
        let ok = true;

        while (ok && (it = rest.shift())) {
          ok = this.use(it, qry);
        }

        if (!ok) {
          debug('warning: high water mark exceeded');
          this.once('drain', write);
        } else {
          disposeCallback();
        }
      };

      if (!res.aborted && rest.length) {
        write();
      } else {
        disposeCallback();
      }
    };

    // Manages a pipeline from reader to writer.
    const drive = (reader, writer) => {
      let ok = true;

      function onDrain() {
        ok = true;

        write();
      }

      function write() {
        if (!ok) {
          return;
        }

        let chunk;

        while (ok && (chunk = reader.read()) !== null) {
          ok = writer.write(chunk);
        }

        if (!ok) {
          writer.once('drain', onDrain);
        }
      }

      const parseErrors = [];

      function onEnd() {
        reader.removeListener('end', onEnd);
        reader.removeListener('readable', write);

        // Removing 'error' listener late.

        reader.destroy();

        writer.removeListener('drain', onDrain);
        writer.end();
      }

      const onError = er => {
        parseErrors.push(er);

        // Gunzip might emit after invalidation:
        // Uncaught TypeError: Cannot read property 'set' of null
        if (this.failures) {
          const key = failureKey('GET', uri);

          this.failures.set(key, er.message);
        }
      };

      const onFinish = () => {
        writer.removeListener('error', onError);
        writer.removeListener('finish', onFinish);

        const isParser = writer === parser;

        if (isParser) {
          const [parseError] = parseErrors;

          if (parseError) {
            debug(
              'parse error: ( %o, %s, %i more )',
              qry,
              parseError.message,
              parseErrors.length,
            );
          }

          dispose(er => {
            const k = schema.etag(uri);
            const v = res.headers.etag || 'NO_ETAG';

            batch.put(k, v);
            batch.write(writeError => {
              if (writeError) {
                this.emit('error', writeError);
              }
              reader.removeListener('error', onError);
              done();
            });
          });
        }
      };

      reader.on('readable', write);
      reader.on('end', onEnd);
      reader.on('error', onError);

      writer.on('error', onError);
      writer.on('finish', onFinish);
    };

    if (res.headers['content-encoding'] === 'gzip') {
      const unzip = zlib.createGunzip();

      drive(res, unzip);
      drive(unzip, parser);
    } else {
      drive(res, parser);
    }
  }
}

module.exports = {
  MangerTransform,
  charsetFromResponse,
  failureKey,
  newer,
  processQuery,
  sameEtag,
};
