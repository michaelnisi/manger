# manger - cache feeds

The manger [Node.js](http://nodejs.org/) module caches XML feeds. It normalizes RSS and Atom feeds to JSON and serves accumulated results. 

## Usage

curl -X POST -d '{"feeds":[{"url":"http://feeds.feedburner.com/logbuch-netzpolitik", "updated":"", "etag":""}]}' -H "Content-Type: application/json" http://127.0.0.1:8765/feeds/

## Installation

Install with [npm](https://npmjs.org):

    npm install manger

## License

[MIT License](https://raw.github.com/michaelnisi/manger/master/LICENSE)

