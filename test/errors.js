// errors - check errors
// @ts-check

const common = require('./lib/common');
const {test} = require('tap');

function check(s, t, cb) {
  const found = [];

  s.on('error', er => {
    found.push(er);
  });

  const acc = [];

  s.on('readable', () => {
    let chunk;

    while ((chunk = s.read()) !== null) {
      acc.push(chunk);
    }
  });

  // Failed requests are cached, an error is emitted only for the first
  // failure per URL. Invalid queries do not produce requests, so errors
  // are emitted for each of those.
  const wanted = ['ERR_INVALID_URL', 'ERR_INVALID_URL'];

  s.on('end', () => {
    t.same(acc.toString(), '[]');
    t.is(found.length, wanted.length);

    for (const it of wanted) {
      const {code, message} = found.shift();
      code ? t.is(code, it) : t.is(message, it);
    }

    cb();
  });

  t.ok(s.write('abc'));
  t.ok(s.write('http://def'));
  t.ok(s.write('ghi'));
  t.ok(s.write('feed://abc'));
  t.ok(s.write('http://def'));
  s.end();
}

function teardown(t, cache) {
  return er => {
    if (er) {
      throw er;
    }

    common.teardown(cache, teardownError => {
      if (teardownError) {
        throw teardownError;
      }

      t.end();
    });
  };
}

test('queries and requests', t => {
  t.plan(2, 'same tests for feeds and entries');

  t.test('feeds', tt => {
    const cache = common.createManger();
    const feeds = cache.feeds();

    check(feeds, tt, teardown(tt, cache));
  });

  t.test('entries', tt => {
    const cache = common.createManger();
    const entries = cache.entries();

    check(entries, tt, teardown(tt, cache));
  });
});
