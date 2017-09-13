'use strict'

exports = module.exports

exports.titles = (es) => {
  return es.map((e) => { return e.title })
}

exports.ids = (es) => {
  return es.map((e) => { return e.id })
}
