'use strict';

/**
 * Global frontend configuration.
 *
 * API_BASE is empty on purpose: the API and this page are served by the
 * SAME server on the same origin, so every request is a plain relative URL
 * ('/api/health'). Nothing to configure, and no CORS involved.
 *
 * DEMO mode (?demo=1 in the URL) runs the whole UI on realistic seeded
 * data with no database at all — handy for demos and screenshots.
 */
const CONFIG = {
  API_BASE: '', // same origin — see note above
  DEMO: new URLSearchParams(location.search).has('demo'),
  POLL_MS: 3000, // how often we poll a repo while it is syncing
};
