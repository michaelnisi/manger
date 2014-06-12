
// keys - keys as in kv

module.exports.key = key

var DIV = module.exports.DIV = '\x00'
  , END = module.exports.END = '\xff'
  , ENT = module.exports.ENT = 'ent'
  , ETG = module.exports.ETG = 'etg'
  , FED = module.exports.FED = 'fed'
  , MGR = module.exports.MGR = 'mgr'
  ;

function range (sel) {
  return { start:sel, end:[sel, END].join(DIV) }
}

module.exports.ALL_FEEDS = range(FED)
module.exports.ALL_ENTRIES = range(ENT)
// etc.

function key (sel, query) {
  if (!sel || (sel !== ENT && sel !== FED && sel !== ETG)) {
    throw(new Error('invalid selector'))
  }
  var uri = query.url
    , time = sel === ENT ? query.since : null
    ;
  if (time !== undefined && time !== null) {
    return [sel, uri, time].join(DIV)
  } else {
    return [sel, uri].join(DIV)
  }
}
