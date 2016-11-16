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

  const tokens = str.split(':')
  const l = tokens.length

  let multipliers = (() => {
    if (l === 1) return [1]
    if (l === 2) return [60, 1]
    if (l > 2) return [3600, 60, 1]
  })()

  let s = tokens.reduce((acc, token, i) => {
    if (i > 2) return acc
    let m = multipliers[i]
    return acc + parseInt(token, 10) * m
  }, 0)

  return isNaN(s) || s === 0 ? null : s
}
