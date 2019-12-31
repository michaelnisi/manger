const common = require('./lib/common');
const {test} = require('tap');

test('queries and requests', t => {
  function go(s, t, cb) {
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
    const wanted = ['ERR_INVALID_URL', 'ERR_INVALID_URL', 'invalid protocol'];

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

  t.plan(2, 'same tests for feeds and entries');

  const teardown = (t, cache) => {
    return er => {
      if (er) {
        throw er;
      }
      common.teardown(cache, er => {
        if (er) {
          throw er;
        }
        t.end();
      });
    };
  };

  t.test('feeds', t => {
    const cache = common.createManger();
    const feeds = cache.feeds();

    go(feeds, t, teardown(t, cache));
  });

  t.test('entries', t => {
    const cache = common.createManger();
    const entries = cache.entries();

    go(entries, t, teardown(t, cache));
  });
});
