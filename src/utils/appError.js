'use strict';

//A small custom error type that carries an HTTP status code.

class AppError extends Error {
  constructor(message, statusCode = 500, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // distinguishes expected errors from bugs
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
