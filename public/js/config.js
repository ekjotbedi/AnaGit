'use strict';

/*
 Global frontend configuration.
 API_BASE is empty on purpose: the API and this page are served by the
 SAME server on the same origin, so every request is a plain relative URL
 ('/api/health').
 */
const CONFIG = {
  API_BASE: '', // same origin
  DEMO: new URLSearchParams(location.search).has('demo'),
  POLL_MS: 3000, // how often we poll a repo while it is syncing
};
