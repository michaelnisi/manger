# manger - proxy feeds 

The manger [Node.js](http://nodejs.org/) module is a feed proxy.

## Usage

    node example/server > /dev/null &

    curl GET /manger/feeds/url

    curl GET /feeds/feeds.muleradio.net/thetalkshow
    curl GET /feeds/feeds.muleradio.net/thetalkshow/2013/10
    curl GET /feeds/feeds.muleradio.net/thetalkshow/2013/10/01
    
    curl -v -XPOST -H "Content-Type: application/json" -d '{"feeds":[{"feeds.muleradio.net/thetalkshow", "from":"Thu, 31 Oct 2012 14:38:06 GMT", "to":"Thu, 31 Oct 2013 14:38:06 GMT"}]}' http://localhost:8765

## Installation

Install with [npm](https://npmjs.org):

    npm install manger

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)

