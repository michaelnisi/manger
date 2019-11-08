'use strict'

// manger - cache feeds

const query = require('./lib/query')
const { Entries } = require('./lib/entries')
const { Feeds, URLs, FeedURLs } = require('./lib/feeds')
const { Manger } = require('./lib/manger')
const { Opts } = require('./lib/init')
const { createLevelDB } = require('./lib/db')

exports = module.exports = Manger

exports.Entries = Entries
exports.FeedURLs = FeedURLs
exports.Feeds = Feeds
exports.Opts = Opts
exports.Queries = query.Queries
exports.URLs = URLs
exports.query = query
exports.Manger = Manger
exports.createLevelDB = createLevelDB
