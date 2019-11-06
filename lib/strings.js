
'use strict'

// strings - transform stringy things

const crypto = require('crypto')
const path = require('path')
const sanitize = require('html-reduce')
const url = require('url')

module.exports = {
  duration,
  entryID,
  entryLink,
  hash,
  html
}

function html (str) {
  if (typeof str !== 'string') return
  return sanitize(str)
}

function duration (str) {
  if (typeof str !== 'string' || str === '') return

  const tokens = str.split(':').slice(0, 3)
  const m = Math.pow(60, tokens.length - 1)

  const [s] = tokens.reduce((acc, token) => {
    let [s, m] = acc
    return [s + token * m, m / 60]
  }, [0, m])

  return isNaN(s) || s === 0 ? null : s
}

function hash (str) {
  return crypto.createHash('sha1').update(str).digest('hex')
}

function entryID (entry) {
  if (!entry) return

  const feed = entry.url
  if (typeof feed !== 'string') return

  const id = entry.id || entry.link || entry.title
  if (typeof id !== 'string') return

  return hash(`${feed}${id}`)
}

const entryLinkWhiteList = new Set([
  '', '.html', '.htm'
])

function entryLink (entry) {
  if (!entry) return

  const link = entry.link
  if (typeof link !== 'string') return

  const media = entry.enclosure ? entry.enclosure.url : null
  if (link === media) return

  const p = url.parse(link).pathname
  const ext = path.extname(p)
  if (!entryLinkWhiteList.has(ext)) return

  return link
}
