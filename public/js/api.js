'use strict';

const API = (() => {
  async function request(path, options = {}) {
    let res;
    try {
      res = await fetch(`${CONFIG.API_BASE}${path}`, {
        credentials: 'same-origin',
        headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
        method: options.method || 'GET',
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (networkErr) {
      const err = new Error('Lost connection to the AnaGit server — is it still running?');
      err.status = 0;
      throw err;
    }

    let payload = null;
    const text = await res.text();
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = null; }
    }

    if (!res.ok) {
      if (res.status === 401 && !options.silent401) {
        window.dispatchEvent(new CustomEvent('anagit:unauth'));
      }
      const message =
        (payload && payload.error && payload.error.message) ||
        (payload && payload.message) ||
        `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      if (payload && payload.error && payload.error.resetAt) {
        err.resetAt = payload.error.resetAt; // rate-limit info from the backend
      }
      throw err;
    }
    return payload;
  }

  return {
    // auth & profile
    health: () => request('/api/health', { silent401: true }),
    me: () => request('/api/me', { silent401: true }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    loginUrl: () => `${CONFIG.API_BASE}/api/auth/github`,

    // repositories
    myGithubRepos: () => request('/api/me/github/repos'),
    repos: () => request('/api/repos'),
    repo: (id) => request(`/api/repos/${id}`),
    addRepo: (fullName) => request('/api/repos', { method: 'POST', body: { fullName } }),
    deleteRepo: (id) => request(`/api/repos/${id}`, { method: 'DELETE' }),
    syncRepo: (id) => request(`/api/repos/${id}/sync`, { method: 'POST' }),
    syncLogs: (id) => request(`/api/repos/${id}/sync-logs`),

    // analytics
    overview: (id) => request(`/api/repos/${id}/overview`),
    commitActivity: (id) => request(`/api/repos/${id}/commit-activity`),
    languages: (id) => request(`/api/repos/${id}/languages`),
    contributors: (id, limit = 10) => request(`/api/repos/${id}/contributors?limit=${limit}`),
    issues: (id, params = {}) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') qs.set(k, v);
      }
      return request(`/api/repos/${id}/issues?${qs.toString()}`);
    },
    staleIssues: (id, days) =>
      request(`/api/repos/${id}/stale-issues${days ? `?days=${days}` : ''}`),
    labels: (id) => request(`/api/repos/${id}/labels`),

    // export — plain URLs; the browser downloads them with the cookie attached
    exportJsonUrl: (id) => `${CONFIG.API_BASE}/api/repos/${id}/export?format=json`,
    exportCsvUrl: (id, section) =>
      `${CONFIG.API_BASE}/api/repos/${id}/export?format=csv&section=${section}`,
    webhookUrl: () => `${location.origin}/api/webhooks/github`,
  };
})();
