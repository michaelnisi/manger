// entries - read entries
// @ts-check

const {entries} = require('./schema');
const {MangerTransform} = require('./streams_base');

/**
 * Transforms queries to entries.
 */
class Entries extends MangerTransform {
  constructor(db, opts) {
    super(db, opts);

    this.pushFeeds = false;
    this.pushEntries = true;
  }

  retrieve(qry, cb) {
    const opts = entries(qry.uri, qry.since, true);
    const values = this.db.createValueStream(opts);

    let ok = true;

    const use = () => {
      if (!ok) { return; }

      let chunk;

      while (ok && (chunk = values.read()) !== null) {
        ok = this.use(chunk, qry);
      }

      if (!ok) {
        this.once('drain', () => {
          ok = true;
          use();
        });
      }
    };

    const onend = er => {
      values.removeListener('readable', use);
      values.removeListener('error', onerror);
      values.removeListener('end', onend);

      if (cb) { cb(er); }
    };

    const onerror = er => {
      const error = new Error('retrieve error: ' + er.message);

      onend(error);
    };

    values.on('readable', use);
    values.on('error', onerror);
    values.on('end', onend);
  }
}

module.exports = {
  Entries,
};
