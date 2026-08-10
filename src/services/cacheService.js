'use strict';

const CacheEntry = require('../models/CacheEntry');

/*
 A thin data-access layer over the CacheEntry collection.
 The GitHub client (services/githubClient.js) uses this to store and
 look up cached API responses.
 */

// Escape a string so it can be used inside a RegExp.
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Look up a cached entry by key (returns a plain object or null)
async function get(key) {
  return CacheEntry.findOne({ key }).lean();
}

// overwrite a cached entry
async function set(key, { data, etag, link, status, ttlSeconds }) {
  const freshUntil = new Date(Date.now() + ttlSeconds * 1000);
  await CacheEntry.findOneAndUpdate(
    { key },
    { key, data, etag, link, status, freshUntil },
    { upsert: true, new: true }
  );
}

async function touch(key, ttlSeconds) {
  await CacheEntry.updateOne(
    { key },
    { freshUntil: new Date(Date.now() + ttlSeconds * 1000) }
  );
}

// Delete every cache entry whose key starts with the given prefix.
async function invalidatePrefix(prefix) {
  await CacheEntry.deleteMany({ key: new RegExp('^' + escapeRegex(prefix)) });
}

// Delete cache rows that haven't been updated in `days` days.
async function pruneOlderThan(days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await CacheEntry.deleteMany({ updatedAt: { $lt: cutoff } });
  return result.deletedCount || 0;
}

module.exports = { get, set, touch, invalidatePrefix, pruneOlderThan };
