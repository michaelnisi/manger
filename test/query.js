// @ts-check

const fs = require('fs');
const path = require('path');
const {Query, Queries} = require('../lib/query');
const split = require('binary-split');
const stread = require('stread');
const {test} = require('tap');
const {pipeline, Writable} = require('readable-stream');

test('trim', t => {
  const strs = ['http://abc', ' http://abc ', 'https://abc', ' https://abc '];

  const wanted = ['http://abc/', 'http://abc/', 'https://abc/', 'https://abc/'];

  strs.forEach((str, i) => {
    t.is(Query.trim(str), wanted[i]);
  });

  t.throws(() => {
    Query.trim('');
  });
  t.throws(() => {
    Query.trim(null);
  });
  t.throws(() => {
    Query.trim('abc');
  });

  t.end();
});

test('query', t => {
  t.throws(() => {
    return new Query({url: ' 5by5.tv/d '});
  });
  t.throws(() => {
    return new Query({url: 'http://'});
  });
  t.throws(() => {
    return new Query({url: 'localhost'});
  });

  const found = [
    new Query({url: 'http://5by5.tv/a'}),
    new Query({
      url: 'http://5by5.tv/b\n',
      since: 'Thu Jan 01 1970 01:00:00 GMT+0100 (CET)',
    }),
    new Query({url: ' http://5by5.tv/c ', since: '1970-01-01'}),
    new Query({url: 'feed://5by5.tv/f'}),
    new Query({url: 'https://5by5.tv/h'}),
  ];

  const wanted = [
    new Query({url: 'http://5by5.tv/a', since: 0}),
    new Query({url: 'http://5by5.tv/b', since: 0}),
    new Query({url: 'http://5by5.tv/c', since: 0}),
    new Query({url: 'feed://5by5.tv/f', since: 0}),
    new Query({url: 'https://5by5.tv/h', since: 0}),
  ];

  for (const it of wanted) {
    t.deepEquals(found.shift(), it);
  }

  t.end();
});

test('request', t => {
  const found = [
    new Query({url: 'http://abc.def/ghi.jkl'}).request(),
    new Query({url: 'http://abc.def/ghi.jkl', etag: '123'}).request(),
    new Query({url: 'https://abc.def/ghi.jkl'}).request(),
  ];

  const headers = {
    // eslint-disable-next-line quote-props
    accept: '*/*',
    'accept-encoding': 'gzip',
    'user-agent': `nodejs/${process.version}`,
  };

  const wanted = [
    {
      hostname: 'abc.def',
      port: 80,
      path: '/ghi.jkl',
      method: 'GET',
      protocol: 'http:',
      headers,
    },
    {
      hostname: 'abc.def',
      port: 80,
      path: '/ghi.jkl',
      method: 'GET',
      protocol: 'http:',
      headers: {...{'if-none-match': '123'}, ...headers},
    },
    {
      hostname: 'abc.def',
      port: 443,
      path: '/ghi.jkl',
      method: 'GET',
      protocol: 'https:',
      headers,
    },
  ];

  t.plan(wanted.length);

  for (const it of wanted) {
    t.same(found.shift(), it);
  }
});

test('redirect', t => {
  const found = [
    new Query({url: 'http://abc.de'}).redirect(301, 'http://fgh.de'),
  ];

  const wanted = [
    new Query({
      url: 'http://fgh.de',
      since: 0,
      code: 301,
      count: 1,
      originalURL: 'http://abc.de',
    }),
  ];

  for (const it of wanted) {
    t.same(found.shift(), it);
  }

  t.throws(() => {
    // @ts-ignore
    new Query({url: 'http://abc.de'}).redirect();
  });
  t.throws(() => {
    // @ts-ignore
    new Query({url: 'http://abc.de'}).redirect(301);
  });
  t.throws(() => {
    // @ts-ignore
    new Query({url: 'http://abc.de'}).redirect('hello', 'there');
  });
  t.throws(() => {
    // @ts-ignore
    new Query({url: 'http://abc.de'}).redirect('fgh.de');
  });

  t.end();
});

test('uri', t => {
  t.is(
    new Query({url: 'http://abc.de'}).redirect(302, 'http://fgh.de').uri,
    'http://abc.de/',
  );
  t.is(
    new Query({url: 'http://abc.de'}).redirect(301, 'http://fgh.de').uri,
    'http://fgh.de/',
  );
  t.end();
});

test('shield queries', t => {
  function go(i, o) {
    const input = i.shift();
    const wanted = o.shift();

    if (input && wanted) {
      const s = stread(input);
      const f = new Queries();

      // @ts-ignore
      s.on('end', () => {
        f.end();
      });

      f.on('error', er => {
        t.is(er.message, wanted.er, 'unexpected error for ' + wanted.index);
      });
      f.on('data', qry => {
        t.same(qry, wanted.res.shift());
      });
      f.on('end', () => {
        go(i, o);
      });

      // @ts-ignore
      s.pipe(f);
    } else {
      t.end();
    }
  }

  const wanted = [
    {},
    {er: 'invalid query'},
    {er: 'invalid query'},
    {er: 'invalid query'},
    {res: [new Query({url: 'http://abc.de'})]},
    {res: [new Query({url: 'http://abc.de'})], er: 'invalid query'},
    {res: [new Query({url: 'http://abc.de'})], er: 'invalid JSON'},
  ].map((item, index) => {
    // Adding index for easier orientation.
    item.index = index;
    return item;
  });

  go(
    [
      '[]',
      '[{}]',
      '[{ "url": "" }]',
      '[{ "url": "http://" }]',
      '[{ "url": "http://abc.de" }]',
      '[{ "url": "http://abc.de" }, {}]',
      '[{ "url": "http://abc.de" }, {""}]',
    ],
    wanted,
  );
});

test('all queries', t => {
  const p = path.join(__dirname, 'data', 'all.json');
  const found = [];

  pipeline(
    fs.createReadStream(p),
    split(),
    new Queries(),
    new Writable({
      objectMode: true,
      write(chunk, enc, cb) {
        found.push(chunk);
        cb();
      },
    }),
    error => {
      if (error) {
        throw error;
      }

      const wanted = [
        new Query({url: 'http://just/b2w.xml'}),
        new Query({url: 'http://some/ddc.xml'}),
        new Query({url: 'http://feeds/rl.xml'}),
        new Query({url: 'http://for/rz.xml'}),
        new Query({url: 'http://testing/tal.xml'}),
      ];

      t.is(found.length, wanted.length);

      for (const q of found) {
        t.same(q, wanted.shift());
      }

      t.end();
    },
  );
});
