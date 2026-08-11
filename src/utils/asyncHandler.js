'use strict';

/**
 * Express doesn't catch errors thrown inside async route handlers.
 * Wrapping a handler with asyncHandler() forwards any rejected promise
 * to Express's error-handling middleware via next(err), so we don't
 * have to write try/catch in every single route.
 *
 *   router.get('/', asyncHandler(async (req, res) => { ... }));
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
