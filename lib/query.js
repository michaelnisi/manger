// query - create queries
// @ts-check

const assert = require('assert');
const {Transform} = require('readable-stream');
const {StringDecoder} = require('string_decoder');
const {URL, format} = require('url');

/**
 * A query for a single feed.
 */
class Query {
  /**
   * Creates a valid query throwing if that’s not feasible.
   *
   * @param {{
   * url: string,
   * since?: number | string,
   * etag?: string,
   * force?: boolean,
   * code?: number,
   * count?: number,
   * originalURL?: string
   * }?} props The specifics of this query.
   */
  constructor({
    url,
    since = null,
    etag = null,
    force = false,
    code = null,
    count = 0,
    originalURL = null,
  }) {
    this.url = Query.trim(url);
    this.since = Query.time(since);
    this.etag = etag;
    this.force = force;

    // Handling HTTP redirects

    this.code = code;
    this.count = count;

    this.originalURL =
      typeof originalURL === 'string' ? Query.trim(originalURL) : null;
  }

  /**
   * The original URL.
   */
  get uri() {
    return this.code === 302 ? this.originalURL : this.url;
  }

  /**
   * Returns a redirected query from this query if the redirection limit,
   * currently five, is not exceeded.
   *
   * @param {number} code The HTTP status code, 301 or 302.
   * @param {string} url The new URL.
   */
  redirect(code, url) {
    assert(typeof code === 'number');
    assert(typeof url === 'string');

    const count = this.count + 1;

    if (count > 5) {
      return null;
    }

    try {
      return new Query({
        url,
        since: this.since,
        etag: this.etag,
        force: this.force,
        code,
        count,
        originalURL: this.url,
      });
    } catch (error) {
      return null;
    }
  }

  request(method) {
    const headers = {
      'accept': '*/*',
      'accept-encoding': 'gzip',
      'user-agent': `nodejs/${process.version}`,
    };
    if (this.etag) {
      headers['if-none-match'] = this.etag;
    }

    const uri = new URL(this.url);

    const {protocol, hostname, pathname, search} = uri;
    const port = Query.ports[protocol];

    return {
      headers,
      hostname,
      method: method || 'GET',
      path: `${pathname}${search}`,
      port: uri.port || port,
      protocol: uri.protocol || 'http:',
    };
  }
}

Query.ports = {
  'http:': 80,
  'https:': 443,
};

Query.trim = str => {
  if (typeof str !== 'string') {
    throw new Error('must be string');
  }

  return format(new URL(str.trim()));
};

Query.time = t => {
  return new Date(t || 0).getTime();
};

/**
 * Transforms a request payload to queries.
 */
class Queries extends Transform {
  constructor(opts) {
    super(opts);

    this._decoder = new StringDecoder();
    this._extra = null;
    this._readableState.objectMode = true;
    this._writableState.objectMode = false;
    this._start = -1;
  }

  concat(chunk) {
    if (this._extra) {
      const tl = this._extra.length + chunk.length;

      return Buffer.concat([this._extra, chunk], tl);
    }

    return chunk;
  }

  _flush(cb) {
    this._decoder = null;
    this._extra = null;

    cb();
  }

  _transform(chunk, enc, cb) {
    let buf = this.concat(chunk);
    let index = 0;
    let oct = null;
    let term = null;
    let end = -1;

    const json = str => {
      term = JSON.parse(str);
    };

    while (index < buf.length) {
      oct = buf[index++];
      if (oct === 123) {
        this._start = index - 1;
      }
      if (oct === 125) {
        end = index;
      }

      if (this._start > -1 && end > -1) {
        const str = this._decoder.write(buf.slice(this._start, end));

        try {
          json(str);
        } catch (error) {
          cb(new Error('invalid JSON'));

          return;
        }

        buf = buf.slice(end + 1, buf.length);
        this._start = -1;
        end = -1;
        index = 0;

        if (term) {
          try {
            const {url, since} = term;
            this.push(new Query({url, since}));
          } catch (error) {
            cb(new Error('invalid query'));

            return;
          }
        }

        term = null;
      }
    }

    this._extra = buf;

    cb();
  }
}

module.exports = {
  Queries,
  Query,
};
