
var st = require('st')
  , http = require('http')
  ;
http.createServer(st(__dirname)).listen(1337)
