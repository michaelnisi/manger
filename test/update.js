'use strict'

const common = require('./lib/common')
const fs = require('fs')
const http = require('http')
const path = require('path')
const split = require('binary-split')
const stream = require('readable-stream')
const test = require('tap').test
const url = require('url')

test('not modified', (t) => {
  t.plan(7)

  const go = () => {
    const store = common.createManger()
    const feeds = store.feeds()
    const p = path.join(__dirname, 'data', 'ALL')
    const input = fs.createReadStream(p)
    const update = () => {
      const updated = store.update()
      updated.on('error', (er) => {
        throw er
      })
      updated.on('end', () => {
        t.pass('should end update')

        Object.keys(fixtures).forEach((key) => {
          t.is(fixtures[key].length, 0, 'should hit all fixtures')
        })

        server.close((er) => {
          if (er) throw er
          t.pass('should close server')
          common.teardown(store, (er) => {
            if (er) throw er
            t.pass('should teardown')
          })
        })
      })
      updated.resume()
    }
    feeds.on('finish', () => {
      store.flushCounter((er) => {
        if (er) throw er
        t.pass('should flush counter')
        update()
      })
    })

    input.pipe(split()).pipe(setup).pipe(feeds).resume()
  }

  const fixtures = {
    'HEAD': [],
    'GET': []
  }

  const server = http.createServer((req, res) => {
    fixtures[req.method].shift()(req, res)
  }).listen(1337, (er) => {
    if (er) throw er
    t.pass('should listen on 1337')
    go()
  })

  const setup = new stream.Transform()
  const headers = {
    'content-type': 'text/xml; charset=UTF-8',
    'ETag': '55346232-18151'
  }
  setup._transform = (chunk, enc, cb) => {
    const uri = url.parse('' + chunk)
    const route = '/' + path.basename(url.format(uri))
    const filename = route + '.xml'

    fixtures['GET'].push((req, res) => {
      res.writeHead(200, headers)
      const p = path.join(__dirname, 'data', filename)
      fs.createReadStream(p).pipe(res)
    })

    fixtures['HEAD'].push((req, res) => {
      res.writeHead(304, headers)
      res.end()
    })

    setup.push(chunk)
    cb()
  }
})
