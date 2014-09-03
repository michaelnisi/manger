
// keys - keys as in kv

exports = module.exports = key

var DIV = exports.DIV = '\x00'
  , END = exports.END = '\xff'
  , ENT = exports.ENT = 'ent'
  , ETG = exports.ETG = 'etg'
  , FED = exports.FED = 'fed'
  , MGR = exports.MGR = 'mgr'
  ;

function range (sel) {
  return { start:sel, end:[sel, END].join(DIV) }
}

exports.ALL_FEEDS = range(FED)
exports.ALL_ENTRIES = range(ENT)

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
