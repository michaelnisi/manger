// @ts-check

module.exports = {
  createManger,
  teardown,
};

const assert = require('assert');
const rimraf = require('rimraf');
const {Manger, createLevelDB} = require('../../');
const {defaults} = require('../../lib/init');

/**
 * Returns a new Manger object initialized with `custom` options.
 */
function createManger(custom) {
  // eslint-disable-next-line no-bitwise
  const name = '/tmp/manger-' + Math.floor(Math.random() * (1 << 24));
  const opts = defaults(custom);
  const db = createLevelDB(name);

  return new Manger(db, opts);
}

function teardown(cache, cb) {
  const {db} = cache;
  assert(db);

  db.close(closeError => {
    if (closeError) {
      throw closeError;
    }

    const {
      _db: {
        db: {location},
      },
    } = db;

    rimraf(location, cleanUpError => {
      if (cleanUpError) {
        throw cleanUpError;
      }

      cb();
    });
  });
}
