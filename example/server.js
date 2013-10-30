
var http = require('http')
  , manger = require('../')

http.createServer(function (req, res) {
  req.pipe(manger()).pipe(res)
}).listen(8765)
