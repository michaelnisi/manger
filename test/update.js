const split = require('binary-split');
const {Transform} = require('readable-stream');
const {basename, join} = require('path');
const {createManger, teardown} = require('./lib/common');
const {createReadStream} = require('fs');
const {createServer} = require('http');
const {format} = require('url');
const {test} = require('tap');

test('not modified', t => {
  const go = () => {
    const store = createManger();
    const feeds = store.feeds();
    const p = join(__dirname, 'data', 'ALL');
    const input = createReadStream(p);

    const update = () => {
      store.update((error, updated) => {
        if (error) { throw error; }

        Object.keys(fixtures).forEach(key => {
          t.is(fixtures[key].length, 0, 'should hit all fixtures');
        });

        server.close(er => {
          if (er) { throw er; }
          t.pass('should close server');
          teardown(store, er => {
            if (er) { throw er; }
            t.pass('should teardown');
            t.end();
          });
        });
      });
    };

    feeds.on('finish', () => {
      store.flushCounter(er => {
        if (er) { throw er; }
        t.pass('should flush counter');
        update();
      });
    });

    input.pipe(split()).pipe(setup).pipe(feeds).resume();
  };

  const fixtures = {
    HEAD: [],
    GET: [],
  };

  const server = createServer((req, res) => {
    fixtures[req.method].shift()(req, res);
  }).listen(1337, er => {
    if (er) { throw er; }
    t.pass('should listen on 1337');
    go();
  });

  const setup = new Transform();
  const headers = {
    'content-type': 'text/xml; charset=UTF-8',
    'ETag': '55346232-18151',
  };
  setup._transform = (chunk, enc, cb) => {
    const uri = new URL('' + chunk);
    const route = '/' + basename(format(uri));
    const filename = route + '.xml';

    fixtures.GET.push((req, res) => {
      res.writeHead(200, headers);

      const p = join(__dirname, 'data', filename);

      createReadStream(p).pipe(res);
    });

    fixtures.HEAD.push((req, res) => {
      res.writeHead(304, headers);
      res.end();
    });

    setup.push(chunk);
    cb();
  };
});
