# manger - proxy feeds 

The manger [Node.js](http://nodejs.org/) module is a feed proxy.

## Usage
    
    GET /feeds/url/year/month/day
    GET /feeds -d

To run an example, in the manger directory, do:

    npm start

    curl -sS localhost:8765/feeds/feeds.muleradio.net/thetalkshow | json
    curl -sS localhost:8765/feeds/feeds.muleradio.net/thetalkshow/2013 | json
    curl -sS localhost:8765/feeds/feeds.muleradio.net/thetalkshow/2013/10 | json

    curl -sS localhost:8765/feeds -d \
        '{"feeds":["feeds.muleradio.net/thetalkshow", 2013, 10], \ 
         ["feeds.muleradio.net/unprofessional", 2013, 10]]}' | json
    
    npm stop

## Installation

Install with [npm](https://npmjs.org):

    npm install manger

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)

