# manger - proxy feeds 

The manger [Node.js](http://nodejs.org/) module is a feed proxy.

## Usage
    
    curl GET /feeds/url/year/month/day

    curl GET /feeds/feeds.muleradio.net/thetalkshow
    curl GET /feeds/feeds.muleradio.net/thetalkshow/2013/10
    curl GET /feeds/feeds.muleradio.net/thetalkshow/2013/10/01

    node example/server > /dev/null &
    curl -v -XPOST -H "Content-Type: application/json" -d \
        '[["feeds.muleradio.net/thetalkshow", 2013, 10]]' \
        http://localhost:8765

## Installation

Install with [npm](https://npmjs.org):

    npm install manger

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)

