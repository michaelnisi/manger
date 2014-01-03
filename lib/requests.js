
// requests - HTTP requests

module.exports.changed = changed

if (process.env.NODE_TEST) {
  module.exports.requestEtag = requestEtag
  module.exports.opts = opts
}

var url = require('url')
  , http = require('http')

function changed (etag, uri, cb) {
  requestEtag(uri, function (er, newEtag) {
    cb(er, etag !== newEtag)
  })
}

function requestEtag (uri, cb) {
  headers(uri, function (er, headers) {
    cb(er, headers ? headers['etag'] : null)
  })
}

function opts (uri, meth) {
  var res =  url.parse(uri)
  if (meth) res.method = meth
  return res
}

function headers (uri, cb) {
  http.request(opts(uri, 'HEAD'), function (res) {
    cb(null, res.headers)
    res.destroy()
  }).on('error', cb).end()
}
