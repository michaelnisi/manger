// @ts-check

const {StringDecoder} = require('string_decoder');
const {Query} = require('../');
const {test} = require('tap');
const {createManger} = require('./lib/common');
const {
  charsetFromResponse,
  failureKey,
  sameEtag,
  processQuery,
  newer,
} = require('../lib/streams_base');

test('closed database', t => {
  const cache = createManger();

  t.plan(1);
  cache.db.close(er => {
    t.throws(() => {
      t.ok(cache.db.isClosed);
    });
  });
});

test('charset from response', t => {
  const res = str => {
    const headers = {'content-type': str};

    return {
      getHeader: name => {
        return headers[name];
      },
    };
  };

  const wanted = [null, null, 'UTF-8'];

  const found = [
    charsetFromResponse(null),
    charsetFromResponse({}),
    charsetFromResponse(res('text/xml; charset=UTF-8')),
  ];

  t.plan(wanted.length);

  for (const it of wanted) {
    t.is(found.shift(), it);
  }
});

test('failure keys', t => {
  t.throws(() => {
    failureKey();
  });
  t.throws(() => {
    failureKey(null);
  });
  t.throws(() => {
    failureKey(123);
  });
  t.throws(() => {
    failureKey('GET', 123);
  });
  t.is(failureKey('HEAD', 'http://abc.de/'), 'HEAD-http://abc.de/');
  t.end();
});

test('compare etags', t => {
  const wanted = [false, false, false, true];

  const found = [
    sameEtag({}, {headers: {}}),
    sameEtag({etag: '123'}, {headers: {}}),
    sameEtag({}, {headers: {etag: '123'}}),
    sameEtag({etag: '123'}, {headers: {etag: '123'}}),
  ];

  t.plan(wanted.length);
  wanted.forEach(it => {
    t.is(found.shift(), it);
  });
});

test('process query', t => {
  const wanted = [
    new Query({url: 'https://abc.de/'}),
    new Query({url: 'https://abc.de/'}),
    new Query({url: 'https://abc.de/', force: true}),
    new Query({url: 'https://abc.de/', force: true}),
  ];

  function Surrogate(force) {
    this.decoder = new StringDecoder();
    this.force = force || false;
    this.redirects = {
      get: () => {},
    };
  }

  const m = new Surrogate();
  const mf = new Surrogate(true);
  const found = [
    processQuery(m, 'https://abc.de/'),
    processQuery(m, Buffer.from('https://abc.de/')),
    processQuery(mf, 'https://abc.de/'),
    processQuery(mf, Buffer.from('https://abc.de/')),
  ];

  t.plan(wanted.length);

  for (const it of wanted) {
    t.same(found.shift(), it);
  }
});

test('newer', t => {
  const wanted = [true, true, false];

  function item(time) {
    return {updated: time};
  }

  function query(time) {
    return {since: time};
  }

  const found = [
    newer(item(0), query(0)),
    newer(item(1), query(0)),
    newer(item(1), query(1)),
  ];

  t.plan(wanted.length);
  for (const it of wanted) {
    t.same(found.shift(), it);
  }
});
