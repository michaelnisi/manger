# manger - proxy feeds 

The manger [Node.js](http://nodejs.org/) module is a feed proxy.

## Usage
    
    GET /feeds/url/year/month/day

    node example/server > /dev/null &
    
    curl localhost:8765/feeds/feeds.muleradio.net/thetalkshow
    curl localhost:8765/feeds/feeds.muleradio.net/thetalkshow/2013
    curl localhost:8765/feeds/feeds.muleradio.net/thetalkshow/2013/10
    
    curl -v -XPOST -H "Content-Type: application/json" -d \
        '[["feeds.muleradio.net/thetalkshow", 2013, 10], \ 
        ["feeds.muleradio.net/unprofessional", 2013]]' \
        http://localhost:8765

## Installation

Install with [npm](https://npmjs.org):

    npm install manger

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)

