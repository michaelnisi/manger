
// entries - stream entries

var entries = require('../').entries
  , levelup = require('levelup')

var writer = entries(opts())
writer.pipe(process.stdout)
go()

function go () {
  var buf = new Buffer(json())
    , len = buf.length
    , start = 0
    , end = 0
    , chunk = null
  write()
  function write () {
    var ok = true
    do {
      end = start + 8
      if (end > len) end = len
      chunk = buf.slice(start, end)
      if (end === len) { // last time
        writer.end(chunk)
      } else {
        ok = writer.write(chunk)
        start += 8
      }
    } while (end < len && ok)
    if (end < len) {
      write.once('drain', write)
    }
  }
}

function terms () {
  return [
    { url:"feeds.muleradio.net/thetalkshow", since:Date.UTC(2013, 11)}
  , { url:"5by5.tv/rss", since:Date.UTC(2013, 11) }
  ]
}

function opts () { return { db:db() } }
function json () { return JSON.stringify(terms()) }
function db () { return levelup('/tmp/mangerdb') }
