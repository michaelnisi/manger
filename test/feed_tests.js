
var test = require('tap').test
  , rimraf = require('rimraf')
  , levelup = require('levelup')
  , join = require('path').join
  , fs = require('fs')
  , queries = require('../').queries
  , feeds = require('../').feeds
  , urls = require('../').urls
  , update = require('../').update

test('setup', function (t) {
  fs.mkdirSync(dir(), 0700)
  t.ok(fs.statSync(dir()).isDirectory(), 'should exist')
  levelup(loc(), null, function (er, db) {
    t.ok(db.isOpen(), 'should be open')
    t.ok(!er, 'should not error')
    _db = db
    t.end()
  })
})

test('populate all', function (t) {
  var reader = fs.createReadStream('./queries/all.json')
    , transf = queries()
    , writer = feeds({ db:db() })

  reader
    .pipe(transf)
    .pipe(writer)

  var r = ''
  writer.on('data', function (chunk) {
    r += chunk
  })
  var data = null
  writer.on('finish', function () {
    function parse () {
      data = JSON.parse(r)
    }
    t.doesNotThrow(parse)

    // update all
    var res = ''
    update(db())
      .on('data', function (chunk) {
        res += chunk
      })
      .on('finish', function () {
        t.is(JSON.parse(res).length, 5)
        t.end()
      })
  })
})

// Details

var _db, _dir

function db () {
  if (!_db) _db = levelup(loc())
  return _db
}

function dir () {
  if (!_dir) _dir = '/tmp/manger-' + Math.floor(Math.random() * (1<<24))
  return _dir
}

function loc () {
  return join(dir(), 'test.db')
}
