
// repl -

var net = require('net')
  , path = require('path')

var r = process.env.CLUSTER_MASTER_REPL ||
        path.resolve(__dirname, 'cluster-master-socket')
if (!isNaN(r)) r = +r

var sock = net.connect(r)

process.stdin.pause();
process.stdin.pipe(sock)
sock.pipe(process.stdout)

sock.on('connect', function () {
  process.stdin.resume();
  process.stdin.setRawMode(true)
})

sock.on('close', function done () {
  sock.removeListener('close', done)
})

process.stdin.on('end', function () {
  process.stdin.setRawMode(false)
  process.stdin.pause()
  sock.destroy()
  console.log()
})

process.stdin.on('data', function (b) {
  if (b.length === 1 && b[0] === 4) {
    process.stdin.emit('end')
  }
})
