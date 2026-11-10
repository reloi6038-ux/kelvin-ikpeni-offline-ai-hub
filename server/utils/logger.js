// server/utils/logger.js
// No external deps — keep the bundle tiny for low-data deploys.

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function stamp() {
  return new Date().toISOString();
}

function format(level, args) {
  const tag = `[${level.toUpperCase()}]`;
  return [`${stamp()} ${tag}`, ...args];
}

module.exports = {
  error: (...a) => CURRENT >= LEVELS.error && console.error(...format('error', a)),
  warn:  (...a) => CURRENT >= LEVELS.warn  && console.warn(...format('warn', a)),
  info:  (...a) => CURRENT >= LEVELS.info  && console.log(...format('info', a)),
  debug: (...a) => CURRENT >= LEVELS.debug && console.log(...format('debug', a))
};