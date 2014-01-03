
// keys - keys as in kv

module.exports.hash = hash
module.exports.key = key

var ENT = module.exports.ENT = 'ent'
  , FED = module.exports.FED = 'fed'
  , ETG = module.exports.ETG = 'etg'
  , DIV = module.exports.DIV = '\x00'
  , END = module.exports.END = '\xff'

var crypto = require('crypto')

function hash (data) {
  return crypto.createHash('sha1').update(data).digest('hex')
}

// @doc
function selector (k) {
  return {
    'entry': ENT
  , 'feed': FED
  , 'eTag': ETG
  }[k]
}

// Generate key from selector and tuple.
// - sel selector()
// - tuple tuple()
function key (sel, tuple) {
  if (!sel || (sel !== ENT && sel !== FED && sel !== ETG)) {
    throw(new Error('invalid selector'))
  }
  var uri = hash(tuple[0])
    , time = tuple[1]
  if (time !== undefined && time !== null) {
    return [sel, uri, time].join(DIV)
  } else {
    return [sel, uri].join(DIV)
  }
}
