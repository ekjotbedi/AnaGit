'use strict';

/**
 * A tiny logger. In a bigger app you'd reach for winston or pino, but
 * for a learning project a thin wrapper over console keeps things clear
 * and dependency-free. Every line is timestamped and level-tagged.
 */
function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info: (...args) => console.log(`[INFO ] ${timestamp()}`, ...args),
  warn: (...args) => console.warn(`[WARN ] ${timestamp()}`, ...args),
  error: (...args) => console.error(`[ERROR] ${timestamp()}`, ...args),
  debug: (...args) => {
    // Only prints when you run with DEBUG=1 in the environment.
    if (process.env.DEBUG) console.debug(`[DEBUG] ${timestamp()}`, ...args);
  },
};

module.exports = logger;
