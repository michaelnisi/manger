'use strict'

const sanitize = require('sanitize-html')

exports.html = html
exports.duration = duration

const allowedTags = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol', 'li',
  'b', 'i', 'strong', 'em', 'code', 'br', 'div', 'pre'
]

function html (str) {
  if (typeof str !== 'string') return null
  return sanitize(str, {
    allowedTags: allowedTags
  })
}

function duration (str) {
  if (typeof str !== 'string' || str === '') return null

  const tokens = str.split(':').slice(0, 3)
  const m = Math.pow(60, tokens.length - 1)

  const [s] = tokens.reduce((acc, token) => {
    let [s, m] = acc
    return [s + token * m, m / 60]
  }, [0, m])

  return isNaN(s) || s === 0 ? null : s
}
