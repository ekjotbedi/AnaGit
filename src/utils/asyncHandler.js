'use strict';

/*
 Wrapping a handler to forward any rejected promise
 to Express's error-handling middleware, to avoid 
 writing try/catch in every single route.
  router.get('/', asyncHandler(async (req, res) => { ... }));
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
