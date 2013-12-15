
//

var resumer = require('resumer')
  , manger = require('../')
  , FeedStream = manger.FeedStream
  , time = manger.time

var payload = [
  { url:'http://5by5.tv/rss', time:time(2013, 11, 11) }
]

var json = JSON.stringify(payload)

var stream = resumer()
stream.queue(json)
stream.pipe(process.stdout)
