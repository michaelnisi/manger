
// entries - stream entries

var entries = require('../').entries
  , time = require('../').time
  , levelup = require('levelup')

var writer = entries(opts)
writer.pipe(process.stdout)
go()

function go () {
  var buf = new Buffer(json())
    , start = 0
    , end = 0
    , chunk = null
  write()
  function write () {
    var ok = true
      , len = buf.length
    do {
      end = start + 8
      if (end > len) end = len
      chunk = buf.slice(start, end)
      ok = writer.write(chunk)
      start += 8
    } while (start < len && ok)
    if (end < len) {
      write.once('drain', write)
    }
  }
}

function terms () {
  return [
    { url:"feeds.muleradio.net/thetalkshow", since:time(2013, 12) }
  ]
}

function opts () { return { db:db() } }
function json () { return JSON.stringify(terms()) }
function db () { return levelup('/tmp/mangerdb') }
