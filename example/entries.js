
// entries - stream entries

var entries = require('../').entries
  , resumer = require('resumer')
  , levelup = require('levelup')

resumer()
  .queue(json())
  .pipe(entries(db()))
  .pipe(process.stdout)

function json () {
  return '[{"url":"5by5.tv/rss", "since":0}]'
}

function db () {
  return levelup('./mydb')
}
