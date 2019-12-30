// init - configure manger
// @ts-check

module.exports = {
  Opts,
  defaults,
};

function Opts(
  cacheSize = 16 * 1024 * 1024,
  counterMax = 500,
  delay = 0,
  failures = {set: (key, value) => {}, get: key => {}, has: key => {}},
  force = false,
  highWaterMark,
  isEntry = entry => {
    return true;
  },
  isFeed = feed => {
    return true;
  },
  objectMode = false,
  redirects = {set: (key, value) => {}, get: key => {}, has: key => {}},
) {
  this.cacheSize = cacheSize;
  this.counterMax = counterMax;
  this.delay = delay;
  this.failures = failures;
  this.force = force;
  this.highWaterMark = highWaterMark;
  this.isEntry = isEntry;
  this.isFeed = isFeed;
  this.objectMode = objectMode;
  this.redirects = redirects;
}

function defaults(opts = Object.create(null)) {
  if (opts instanceof Opts) {
    return opts;
  }

  return new Opts(
    opts.cacheSize,
    opts.counterMax,
    opts.delay,
    opts.failures,
    opts.force,
    opts.highWaterMark,
    opts.isEntry,
    opts.isFeed,
    opts.objectMode,
    opts.redirects,
  );
}
