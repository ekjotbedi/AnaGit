'use strict';

const logger = require('../utils/logger');
const { config } = require('../config');

// 404 handler for any route that didn't match
function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: { message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
}

/*
 Central error handler; every thrown/next-ed error ends up here, so responses stay consistent.
 */
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} →`, err.stack || err.message);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} → ${statusCode}: ${err.message}`);
  }

  const body = {
    error: {
      message: err.message || 'Internal Server Error',
    },
  };
  if (err.details) body.error.details = err.details;
  if (err.resetAt) body.error.resetAt = err.resetAt;
  // Only leak stack traces in development.
  if (!config.isProd && statusCode >= 500) body.error.stack = err.stack;

  res.status(statusCode).json(body);
}

module.exports = { notFoundHandler, errorHandler };
