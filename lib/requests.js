
// requests - HTTP requests

module.exports.etag = etag

var url = require('url')
  , http = require('http')

function etag (uri, cb) {
  headers(uri, function (headers) {
    var etag = headers ? headers['etag'] : null
    cb(etag)
  })
}

function opts (uri, meth) {
  var o = url.parse(uri)
  return {
    host: o.host
  , port: o.port || 80
  , path: o.path
  , method: meth || 'GET'
  }
}

function headers (uri, cb) {
  var req = http.request(opts(uri, 'HEAD'), function (res) {
    cb(res.headers)
  })
    req.on('error', function (er) {
      cb(null)
    })
  req.end()
}
