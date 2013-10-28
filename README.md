# manger - serve cached feeds

The manger [Node.js](http://nodejs.org/) module is a feed proxy. It normalizes RSS and Atom feeds to JSON and serves accumulated results. 

## Namespacing

$url\x00$date\x00$url

## Usage

    npm start

### Request
 
In a file `request_data.json`:

    {
      "feeds": [
        {"url": "http://feeds.feedburner.com/logbuch-netzpolitik",
         "etag": "+SziAo0Bsg84JyAQIW59viIx6Z0"}
    ], "since":"2013-05-05"
    }
    
    curl -X POST -d '`cat request_data.json`' -H "Content-Type: application/json" http://127.0.0.1:8765/manger/feeds/

### Response

    {}

## Installation

Install with [npm](https://npmjs.org):

    npm install manger

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)

