'use strict';

const { config, validateConfig } = require('./config');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const { createApp } = require('./app');
const { startScheduler, stopScheduler } = require('./jobs/scheduler');
const logger = require('./utils/logger');

/*
 Application entry point:
  1. validate configuration
  2. connect to MongoDB
  3. build the Express app
  4. start listening
  5. start the background job scheduler
  6. shut everything down cleanly on Ctrl-C / termination
 */
async function start() {
  try {
    validateConfig();

    await connectDatabase();

    const app = createApp();
    const server = app.listen(config.port, () => {
      logger.info(`AnaGit backend listening on http://localhost:${config.port}`);
      logger.info(`Environment: ${config.env}`);
    });

    startScheduler();

    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down...`);
      stopScheduler();
      server.close(async () => {
        await disconnectDatabase();
        logger.info('Shutdown complete. Bye!');
        process.exit(0);
      });
      // Force-exit if something hangs.
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

// Catch anything we forgot to handle so the process doesn't die silently.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
});

start();