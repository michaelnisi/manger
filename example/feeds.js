
var manger = require('../')
  , levelup = require('levelup')

levelup(loc(), null, function (er, db) {
  var opts = manger.opts(db)
    , writer = manger.feeds(opts)
    , queries = queries()
    , i = queries.length

  writer.pipe(process.stdout)

  ;(function write () {
    var ok = true
    do { ok = writer.write(queries[--i]) } while (i > 0)
  })()
  i > 0 ? writer.once('drain', write) : writer.end()

  function queries () {
    return [
      ['http://feeds.muleradio.net/thetalkshow']
    , ['http://feeds.muleradio.net/mistakes']
    ]
  }
})

function loc () {
  return '/tmp/mangerdb'
}
