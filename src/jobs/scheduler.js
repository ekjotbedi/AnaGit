'use strict';

const cron = require('node-cron');
const { config } = require('../config');
const logger = require('../utils/logger');
const { syncAllRepositories } = require('../services/syncService');
const cacheService = require('../services/cacheService');
const tasks = [];

function startScheduler() {
  // Validate the cron expression so typo fails at startup itself
  if (!cron.validate(config.sync.cron)) {
    logger.error(`Invalid SYNC_CRON expression: "${config.sync.cron}" — skipping scheduled sync`);
  } else {
    const syncTask = cron.schedule(config.sync.cron, async () => {
      logger.info('Cron: running scheduled repository sync');
      try {
        await syncAllRepositories({ triggeredBy: 'scheduled' });
      } catch (err) {
        logger.error('Scheduled sync failed:', err.message);
      }
    });
    tasks.push(syncTask);
    logger.info(`Scheduled repository sync registered (cron: "${config.sync.cron}")`);
  }

  const cleanupTask = cron.schedule('15 3 * * *', async () => {
    try {
      const removed = await cacheService.pruneOlderThan(7);
      logger.info(`Cron: pruned ${removed} stale cache entries`);
    } catch (err) {
      logger.error('Cache cleanup failed:', err.message);
    }
  });
  tasks.push(cleanupTask);
}

function stopScheduler() {
  for (const task of tasks) task.stop();
  tasks.length = 0;
}

module.exports = { startScheduler, stopScheduler };
