'use strict';

/**
 * DEMO MODE (open the app with ?demo=1)
 *
 * Wraps window.fetch and answers AnaGit API calls with realistic seeded
 * data, so the full UI can be demonstrated with no backend, no MongoDB
 * and no GitHub OAuth app. Nothing here runs in normal mode.
 */
(() => {
  if (!CONFIG.DEMO) return;

  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();

  // ── seeded repos ────────────────────────────────────────────
  const repos = [
    {
      _id: 'demo-repo-1', githubId: 101, owner: 'nova-labs', name: 'ion-engine',
      fullName: 'nova-labs/ion-engine',
      description: 'A tiny deterministic physics engine for orbital simulations. Written for fun, kept for science.',
      htmlUrl: 'https://github.com/nova-labs/ion-engine', defaultBranch: 'main',
      isPrivate: false, isFork: false, stars: 4213, forks: 388, watchers: 96,
      openIssuesCount: 47, addedBy: 'demo-user',
      lastSyncedAt: new Date(now - 7 * 60 * 1000).toISOString(),
      syncStatus: 'idle', syncError: null,
    },
    {
      _id: 'demo-repo-2', githubId: 102, owner: 'asha-dev', name: 'anagit',
      fullName: 'asha-dev/anagit',
      description: 'GitHub engineering analytics dashboard — this very project.',
      htmlUrl: 'https://github.com/asha-dev/anagit', defaultBranch: 'main',
      isPrivate: true, isFork: false, stars: 12, forks: 1, watchers: 3,
      openIssuesCount: 6, addedBy: 'demo-user',
      lastSyncedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      syncStatus: 'idle', syncError: null,
    },
  ];

  // ── commit activity: 26 weeks with believable rises and drops ──
  const weeklyTotals = [12, 18, 15, 22, 26, 19, 31, 28, 35, 24, 29, 38, 33, 41, 36, 30, 44, 39, 47, 42, 35, 51, 46, 40, 55, 49];
  const activity = weeklyTotals.map((total, i) => {
    const weekStart = new Date(now - (26 - i) * 7 * DAY);
    const days = [0, 0, 0, 0, 0, 0, 0];
    let left = total;
    const weights = [0.04, 0.2, 0.22, 0.2, 0.18, 0.13, 0.03];
    for (let d = 0; d < 7; d++) {
      const v = d === 6 ? left : Math.round(total * weights[d]);
      days[d] = Math.max(0, Math.min(v, left));
      left -= days[d];
    }
    return { weekStart: weekStart.toISOString(), total, days };
  });

  // ── historical snapshots (the trend) ────────────────────────
  // Kept consistent with the seeded issues list below (29 open / 14
  // closed issues, 9 open / 5 closed PRs) so the KPI deltas make sense.
  const trend = Array.from({ length: 12 }, (_, i) => ({
    capturedAt: new Date(now - (12 - i) * 5 * DAY).toISOString(),
    openIssues: [38, 36, 39, 34, 35, 37, 32, 33, 30, 31, 27, 31][i],
    closedIssues: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 13][i],
    openPullRequests: [12, 10, 13, 11, 9, 12, 10, 11, 8, 10, 9, 10][i],
    closedPullRequests: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5][i],
    totalCommits: 3400 + i * 68,
    contributorsCount: [7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 10][i],
    stars: 3900 + i * 26,
  }));

  const languages = {
    totalBytes: 1873420,
    capturedAt: new Date(now - 7 * 60 * 1000).toISOString(),
    languages: [
      { language: 'JavaScript', bytes: 968214, percentage: 51.68 },
      { language: 'TypeScript', bytes: 512300, percentage: 27.35 },
      { language: 'CSS', bytes: 173010, percentage: 9.23 },
      { language: 'HTML', bytes: 121400, percentage: 6.48 },
      { language: 'Shell', bytes: 61208, percentage: 3.27 },
      { language: 'Dockerfile', bytes: 37288, percentage: 1.99 },
    ],
  };

  const contributors = [
    ['galileo-g', 1204, 88410, 41230, 2], ['ada-l', 861, 51222, 20915, 5],
    ['torvald-s', 640, 30918, 25107, 9], ['mira-k', 402, 22013, 9930, 12],
    ['dev-anders', 371, 18777, 8412, 16], ['sam-oncall', 233, 9104, 6220, 22],
    ['jinx-ci', 148, 5023, 4118, 30], ['priya-r', 96, 3811, 1204, 45],
    ['leo-fix', 51, 1920, 866, 61], ['tam-docs', 27, 1204, 410, 90],
  ].map(([login, commits, additions, deletions, daysAgo], i) => ({
    _id: `demo-c-${i}`, repo: 'demo-repo-1', login, avatarUrl: null,
    htmlUrl: `https://github.com/${login}`, commits, additions, deletions,
    lastActiveAt: new Date(now - daysAgo * DAY).toISOString(),
  }));

  const LABELS = ['bug', 'enhancement', 'help wanted', 'documentation', 'performance', 'good first issue', 'ci', 'breaking-change'];
  const TITLES = [
    'Orbit decay drifts after 10k simulation steps', 'Add quaternion support to rigid bodies',
    'RK4 integrator loses precision near periapsis', 'Docs: getting-started example crashes on Node 22',
    'Collision islands not waking neighbouring bodies', 'Vectorize broadphase with SIMD where available',
    'Memory leak when re-seeding the world', 'Expose deterministic replay API',
    'CI: flaky test in constraint solver suite', 'Support double precision as a build flag',
    'Refactor event system to plain callbacks', 'Gravity wells ignore mass scaling factor',
    'Benchmarks page renders NaN for missing runs', 'Add typings for the plugin interface',
    'Sleep threshold should be configurable per body', 'Broken anchor links in API reference',
    'Continuous collision detection tunnels at high dt', 'Improve error message on invalid world bounds',
  ];

  const issues = Array.from({ length: 57 }, (_, i) => {
    const isPR = i % 4 === 2;
    const closed = i % 3 === 0;
    const updatedDaysAgo = [1, 2, 4, 7, 12, 20, 33, 45, 61, 74, 95, 120][i % 12];
    const labels = [LABELS[i % LABELS.length]];
    if (i % 5 === 0) labels.push(LABELS[(i + 3) % LABELS.length]);
    return {
      number: 480 - i,
      title: TITLES[i % TITLES.length],
      state: closed ? 'closed' : 'open',
      isPullRequest: isPR,
      authorLogin: contributors[i % contributors.length].login,
      authorAvatar: null,
      labels,
      assignees: [],
      comments: (i * 7) % 23,
      ghCreatedAt: new Date(now - (updatedDaysAgo + 30) * DAY).toISOString(),
      ghUpdatedAt: new Date(now - updatedDaysAgo * DAY).toISOString(),
      ghClosedAt: closed ? new Date(now - updatedDaysAgo * DAY).toISOString() : null,
      htmlUrl: `https://github.com/nova-labs/ion-engine/issues/${480 - i}`,
    };
  });

  const syncLogs = [
    ['success', 'manual', 512, 7, 18], ['success', 'webhook', 74, 2, 190],
    ['success', 'scheduled', 486, 11, 360], ['error', 'webhook', 12, 3, 500, 'GitHub API rate limit exceeded. Try again later.'],
    ['success', 'scheduled', 470, 9, 720], ['success', 'initial-add', 1893, 41, 4300],
  ].map(([status, triggeredBy, itemsProcessed, durS, minAgo, error], i) => ({
    _id: `demo-log-${i}`, repo: 'demo-repo-1', type: 'full', status, triggeredBy,
    itemsProcessed, error: error || undefined,
    startedAt: new Date(now - minAgo * 60 * 1000).toISOString(),
    finishedAt: new Date(now - minAgo * 60 * 1000 + durS * 1000).toISOString(),
  }));

  const githubRepos = [
    ['nova-labs/ion-engine', 'A tiny deterministic physics engine for orbital simulations.', 'JavaScript', 4213, false, false],
    ['asha-dev/anagit', 'GitHub engineering analytics dashboard — this very project.', 'JavaScript', 12, true, false],
    ['asha-dev/dotfiles', 'Shell + editor config, forever a work in progress.', 'Shell', 4, false, false],
    ['asha-dev/algo-drills', 'Daily DSA practice, one folder per topic.', 'Python', 9, false, false],
    ['nova-labs/telemetry-ui', 'Grafana-style dashboards for the flight stack.', 'TypeScript', 861, false, false],
    ['asha-dev/react', 'The library for web and native user interfaces.', 'JavaScript', 231000, false, true],
    ['nova-labs/ground-station', 'Packet decoder and mission console.', 'Rust', 1204, false, false],
    ['asha-dev/portfolio', 'Personal site, rebuilt every time a new CSS trick drops.', 'CSS', 2, false, false],
  ].map(([fullName, description, language, stars, priv, fork], i) => ({
    githubId: 900 + i, fullName, name: fullName.split('/')[1], owner: fullName.split('/')[0],
    description, private: priv, fork, stars, forks: Math.round(stars / 11),
    language, updatedAt: new Date(now - (i + 1) * 2 * DAY).toISOString(),
    htmlUrl: `https://github.com/${fullName}`,
  }));

  const me = {
    id: 'demo-user', githubId: 5551212, login: 'asha-dev', name: 'Asha Deverell',
    avatarUrl: null, htmlUrl: 'https://github.com/asha-dev', company: null,
    location: 'Toronto', bio: 'CS student · builds dashboards for fun',
    publicRepos: 24, followers: 87, following: 132,
    scopes: ['read:user', 'repo'], lastLoginAt: new Date(now - 40 * 60 * 1000).toISOString(),
  };

  // ── request router ──────────────────────────────────────────
  const overview = () => ({
    issues: {
      open: issues.filter((i) => !i.isPullRequest && i.state === 'open').length,
      closed: issues.filter((i) => !i.isPullRequest && i.state === 'closed').length,
    },
    pullRequests: {
      open: issues.filter((i) => i.isPullRequest && i.state === 'open').length,
      closed: issues.filter((i) => i.isPullRequest && i.state === 'closed').length,
    },
    totalCommits: 4148,
    contributorsCount: contributors.length,
    trend,
  });

  function route(method, path, query, body) {
    if (path === '/api/health') return { status: 'ok', service: 'anagit', time: new Date().toISOString(), db: 'connected (demo)' };
    if (path === '/api/me') return me;
    if (path === '/api/auth/logout') return { message: 'Logged out' };
    if (path === '/api/me/github/repos') return githubRepos;
    if (path === '/api/repos' && method === 'GET') return repos;

    if (path === '/api/repos' && method === 'POST') {
      const src = githubRepos.find((g) => g.fullName === body.fullName);
      const repo = {
        _id: `demo-repo-${Date.now()}`, githubId: src.githubId,
        owner: src.owner, name: src.name, fullName: src.fullName,
        description: src.description, htmlUrl: src.htmlUrl, defaultBranch: 'main',
        isPrivate: src.private, isFork: src.fork, stars: src.stars, forks: src.forks,
        watchers: 5, openIssuesCount: 0, addedBy: 'demo-user',
        lastSyncedAt: null, syncStatus: 'syncing', syncError: null,
      };
      repos.push(repo);
      setTimeout(() => {
        repo.syncStatus = 'idle';
        repo.lastSyncedAt = new Date().toISOString();
      }, 5200);
      return { message: 'Repository added. Initial sync started in the background.', repo };
    }

    const m = path.match(/^\/api\/repos\/([^/]+)(?:\/(.+))?$/);
    if (m) {
      const repo = repos.find((r) => r._id === m[1]);
      if (!repo) return { __status: 404, error: { message: 'Repository not found.' } };
      const sub = m[2] || '';

      if (!sub && method === 'GET') return repo;
      if (!sub && method === 'DELETE') {
        repos.splice(repos.indexOf(repo), 1);
        return { message: 'Repository and its data were removed.' };
      }
      if (sub === 'sync') {
        if (repo.syncStatus === 'syncing') return { __status: 409, message: 'A sync is already in progress.' };
        repo.syncStatus = 'syncing';
        setTimeout(() => {
          repo.syncStatus = 'idle';
          repo.lastSyncedAt = new Date().toISOString();
          syncLogs.unshift({
            _id: `demo-log-${Date.now()}`, repo: repo._id, type: 'full', status: 'success',
            triggeredBy: 'manual', itemsProcessed: 490 + Math.floor(Math.random() * 40),
            startedAt: new Date(Date.now() - 6000).toISOString(), finishedAt: new Date().toISOString(),
          });
        }, 6000);
        return { message: 'Sync started in the background.' };
      }
      if (sub === 'sync-logs') return syncLogs;
      if (sub === 'overview') return overview();
      if (sub === 'commit-activity') return activity;
      if (sub === 'languages') return languages;
      if (sub === 'contributors') return contributors.slice(0, Number(query.get('limit')) || 10);
      if (sub === 'labels') {
        const counts = {};
        for (const i of issues) for (const l of i.labels) counts[l] = (counts[l] || 0) + 1;
        return Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
      }
      if (sub === 'stale-issues') {
        const days = Number(query.get('days')) || 30;
        const cutoff = Date.now() - days * DAY;
        const stale = issues
          .filter((i) => !i.isPullRequest && i.state === 'open' && new Date(i.ghUpdatedAt).getTime() < cutoff)
          .sort((a, b) => new Date(a.ghUpdatedAt) - new Date(b.ghUpdatedAt))
          .map((i) => ({ ...i, idleDays: Math.floor((Date.now() - new Date(i.ghUpdatedAt)) / DAY) }));
        return { thresholdDays: days, count: stale.length, issues: stale };
      }
      if (sub === 'issues') {
        let list = [...issues];
        const type = query.get('type'), st = query.get('state'), label = query.get('label');
        if (type === 'issue') list = list.filter((i) => !i.isPullRequest);
        if (type === 'pr') list = list.filter((i) => i.isPullRequest);
        if (st === 'open' || st === 'closed') list = list.filter((i) => i.state === st);
        if (label) list = list.filter((i) => i.labels.includes(label));
        list.sort((a, b) => new Date(b.ghUpdatedAt) - new Date(a.ghUpdatedAt));
        const page = Number(query.get('page')) || 1;
        const limit = Number(query.get('limit')) || 20;
        return {
          items: list.slice((page - 1) * limit, page * limit),
          pagination: { page, limit, total: list.length, totalPages: Math.ceil(list.length / limit) },
        };
      }
    }
    return { __status: 404, error: { message: `Route not found: ${method} ${path}` } };
  }

  // ── fetch interceptor ───────────────────────────────────────
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, options = {}) => {
    const str = String(url);
    // Resolve against the current origin so both relative ('/api/repos')
    // and absolute ('http://host/api/repos') forms work, then only handle
    // our own API paths — anything else goes to the real fetch untouched.
    let u;
    try {
      u = new URL(str, location.origin);
    } catch {
      return realFetch(url, options);
    }
    if (u.origin !== location.origin || !u.pathname.startsWith('/api/')) {
      return realFetch(url, options);
    }

    const body = options.body ? JSON.parse(options.body) : undefined;
    await new Promise((r) => setTimeout(r, 120 + Math.random() * 260)); // fake latency
    const result = route(options.method || 'GET', u.pathname, u.searchParams, body);
    const status = result && result.__status ? result.__status : 200;
    if (result && result.__status) delete result.__status;
    return new Response(JSON.stringify(result), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
})();
