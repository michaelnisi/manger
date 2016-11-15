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
  if (tokens.length === 1) {
    let seconds = parseInt(tokens[0], 10)
    if (isNaN(seconds)) return null
    return seconds
  } else if (tokens.length === 2) {
    let minutes = parseInt(tokens[0], 10)
    if (isNaN(minutes)) return null
    let seconds = parseInt(tokens[1], 10)
    if (isNaN(seconds)) return null
    return minutes * 60 + seconds
  } else if (tokens.length > 2) {
    let hours = parseInt(tokens[0], 10)
    if (isNaN(hours)) return null
    let minutes = parseInt(tokens[1], 10)
    if (isNaN(minutes)) return null
    let seconds = parseInt(tokens[2], 10)
    if (isNaN(seconds)) return null
    return hours * 3600 + minutes * 60 + seconds
  }
  return null
}
