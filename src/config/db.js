'use strict';

const mongoose = require('mongoose');
const { config } = require('./index');
const logger = require('../utils/logger');

async function connectDatabase() {
  // Surface Mongoose connection lifecycle events for easier debugging.
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) =>
    logger.error('MongoDB connection error:', err.message)
  );
  mongoose.connection.on('disconnected', () =>
    logger.warn('MongoDB disconnected')
  );

  await mongoose.connect(config.mongoUri, {
    // Fail quickly if the DB is unreachable rather than hanging forever.
    serverSelectionTimeoutMS: 10000,
  });

  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.connection.close();
}

module.exports = { connectDatabase, disconnectDatabase };
