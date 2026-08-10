'use strict';

require('dotenv').config();

const missing = [];
function env(key, { required = false, fallback = undefined } = {}) {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (required) missing.push(key);
    return fallback;
  }
  return value;
}

const config = {
  env: env('NODE_ENV', { fallback: 'development' }),
  isProd: env('NODE_ENV', { fallback: 'development' }) === 'production',
  port: parseInt(env('PORT', { fallback: '4000' }), 10),

  mongoUri: env('MONGODB_URI', { required: true }),
  sessionSecret: env('SESSION_SECRET', { required: true }),
  tokenEncryptionKey: env('TOKEN_ENCRYPTION_KEY', { required: true }),

  github: {
    clientId: env('GITHUB_CLIENT_ID', { required: true }),
    clientSecret: env('GITHUB_CLIENT_SECRET', { required: true }),
    callbackUrl: env('GITHUB_CALLBACK_URL', {
      fallback: 'http://localhost:4000/api/auth/github/callback',
    }),
    scopes: env('GITHUB_OAUTH_SCOPES', { fallback: 'read:user,repo' })
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    webhookSecret: env('GITHUB_WEBHOOK_SECRET', { required: true }),
  },

  cache: {
    ttlSeconds: parseInt(env('CACHE_TTL_SECONDS', { fallback: '300' }), 10),
  },

  sync: {
    maxPages: parseInt(env('MAX_PAGES', { fallback: '10' }), 10),
    maxRateLimitWaitMs: parseInt(
      env('MAX_RATE_LIMIT_WAIT_MS', { fallback: '60000' }),
      10
    ),
    cron: env('SYNC_CRON', { fallback: '0 */6 * * *' }),
    staleIssueDays: parseInt(env('STALE_ISSUE_DAYS', { fallback: '30' }), 10),
  },
};

// Validating configuration on startup...fail fast with a clear message
function validateConfig() {
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}.\n` +
        `Copy .env.example to .env and fill in the values.`
    );
  }
}

module.exports = { config, validateConfig };
