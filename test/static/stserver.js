
var st = require('st')
  , join = require('path').join
  , http = require('http')

http.createServer(st(__dirname)).listen(1337)
