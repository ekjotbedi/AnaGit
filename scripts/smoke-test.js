'use strict';
/*
 End-to-end smoke test.
 Boots the REAL AnaGit server against a throwaway in-memory MongoDB and
 exercises real HTTP endpoints plus the statistics aggregations
 (no GitHub credentials or external database required.)
 
    npm run smoke
 */
const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

let failures = 0;
function check(name, cond, extra) {
  if (cond) {
    console.log(` ${name}`);
  } else {
    failures += 1;
    console.error(`${name}`, extra !== undefined ? JSON.stringify(extra) : '');
  }
}

(async () => {
  const mem = await MongoMemoryServer.create();

  // Environment must be set before requiring the app config.
  process.env.MONGODB_URI = mem.getUri();

  process.env.SESSION_SECRET = 'test-session-secret';
  process.env.TOKEN_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.GITHUB_CLIENT_ID = 'test-id';
  process.env.GITHUB_CLIENT_SECRET = 'test-secret';
  process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
  process.env.NODE_ENV = 'development';
  process.env.PORT = '4123';

  const { connectDatabase, disconnectDatabase } = require('../src/config/db');
  const { createApp } = require('../src/app');
  const statsService = require('../src/services/statsService');

  await connectDatabase();
  const app = createApp();
  const server = app.listen(4123);
  const base = 'http://127.0.0.1:4123';

  try {
    // --- Health / info ---
    let r = await fetch(`${base}/api/health`);
    let j = await r.json();
    check('GET /api/health -> 200', r.status === 200, r.status);
    check('health reports db connected', j.db === 'connected', j);

    r = await fetch(`${base}/`);
    check('GET / -> 200', r.status === 200, r.status);

    // --- Auth gating ---
    r = await fetch(`${base}/api/me`);
    check('GET /api/me (no session) -> 401', r.status === 401, r.status);
    r = await fetch(`${base}/api/repos`);
    check('GET /api/repos (no session) -> 401', r.status === 401, r.status);
    r = await fetch(`${base}/api/repos/abc123/overview`);
    check('GET analytics (no session) -> 401', r.status === 401, r.status);

    // --- Unknown route ---
    r = await fetch(`${base}/api/nope`);
    check('unknown route -> 404', r.status === 404, r.status);

    // --- Webhook signature verification ---
    r = await fetch(`${base}/api/webhooks/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'ping', 'X-GitHub-Delivery': 'd1' },
      body: JSON.stringify({ zen: 'hi', hook_id: 1 }),
    });
    check('webhook without signature -> 401', r.status === 401, r.status);

    const body = JSON.stringify({ zen: 'Keep it simple', hook_id: 99 });
    const sig = 'sha256=' + crypto.createHmac('sha256', 'test-webhook-secret').update(body).digest('hex');
    r = await fetch(`${base}/api/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'ping',
        'X-GitHub-Delivery': 'd2',
        'X-Hub-Signature-256': sig,
      },
      body,
    });
    j = await r.json();
    check('webhook with valid signature (ping) -> pong', r.status === 200 && j.message === 'pong', { status: r.status, j });

    // --- Seed data + exercise the real MongoDB aggregation pipelines ---
    const User = require('../src/models/User');
    const Repository = require('../src/models/Repository');
    const Issue = require('../src/models/Issue');
    const Contributor = require('../src/models/Contributor');
    const CommitActivity = require('../src/models/CommitActivity');
    const LanguageStat = require('../src/models/LanguageStat');
    const Commit = require('../src/models/Commit');
    const RepoSnapshot = require('../src/models/RepoSnapshot');

    const user = await User.create({ githubId: 1, login: 'octocat' });
    const repo = await Repository.create({
      githubId: 10, owner: 'octocat', name: 'demo', fullName: 'octocat/demo',
      addedBy: user._id, stars: 5,
    });
    const rid = repo._id;
    const old = new Date(Date.now() - 90 * 864e5);
    const recent = new Date(Date.now() - 2 * 864e5);
    await Issue.create([
      { repo: rid, number: 1, title: 'Old bug', state: 'open', isPullRequest: false, labels: ['bug'], ghUpdatedAt: old },
      { repo: rid, number: 2, title: 'Fresh', state: 'open', isPullRequest: false, labels: ['bug', 'help wanted'], ghUpdatedAt: recent },
      { repo: rid, number: 3, title: 'Closed', state: 'closed', isPullRequest: false, labels: [], ghUpdatedAt: recent },
      { repo: rid, number: 4, title: 'A PR', state: 'open', isPullRequest: true, labels: ['enhancement'], ghUpdatedAt: recent },
    ]);
    await Contributor.create([
      { repo: rid, login: 'alice', commits: 40, additions: 100, deletions: 10 },
      { repo: rid, login: 'bob', commits: 12, additions: 30, deletions: 5 },
    ]);
    await CommitActivity.create([
      { repo: rid, weekStart: new Date('2026-06-01'), total: 7, days: [1, 1, 1, 1, 1, 1, 1] },
      { repo: rid, weekStart: new Date('2026-06-08'), total: 3, days: [0, 1, 0, 1, 0, 1, 0] },
    ]);
    await LanguageStat.create({
      repo: rid, totalBytes: 1000,
      languages: [
        { language: 'JavaScript', bytes: 750, percentage: 75 },
        { language: 'CSS', bytes: 250, percentage: 25 },
      ],
    });
    await Commit.create([
      { repo: rid, sha: 'aaa', committedAt: recent, authorLogin: 'alice' },
      { repo: rid, sha: 'bbb', committedAt: recent, authorLogin: 'bob' },
    ]);
    await RepoSnapshot.create({ repo: rid, openIssues: 2, closedIssues: 1, totalCommits: 2, stars: 5 });

    const overview = await statsService.getOverview(rid);
    check('overview: open issues = 2', overview.issues.open === 2, overview.issues);
    check('overview: closed issues = 1', overview.issues.closed === 1, overview.issues);
    check('overview: open PRs = 1', overview.pullRequests.open === 1, overview.pullRequests);
    check('overview: totalCommits = 2', overview.totalCommits === 2, overview.totalCommits);
    check('overview: has 1 trend snapshot', Array.isArray(overview.trend) && overview.trend.length === 1, overview.trend.length);

    const stale = await statsService.getStaleIssues(rid, 30);
    check('stale: count = 1', stale.count === 1, stale.count);
    check('stale: issue #1, idleDays > 30', stale.issues[0] && stale.issues[0].number === 1 && stale.issues[0].idleDays > 30, stale.issues[0]);

    const labels = await statsService.getLabelDistribution(rid);
    const bug = labels.find((l) => l.label === 'bug');
    check('labels: "bug" counted twice', bug && bug.count === 2, labels);

    const contribs = await statsService.getTopContributors(rid, 10);
    check('contributors: top is alice', contribs[0] && contribs[0].login === 'alice', contribs.map((c) => c.login));

    const langs = await statsService.getLanguages(rid);
    check('languages: JS = 75%', langs.languages[0].percentage === 75, langs.languages);

    const activity = await statsService.getCommitActivity(rid);
    check('activity: sorted oldest->newest', activity.length === 2 && activity[0].total === 7, activity.map((a) => a.total));

    const issuesPage = await statsService.getIssues(rid, { type: 'issue', page: 1, limit: 20 });
    check('issues: type=issue total = 3', issuesPage.pagination.total === 3, issuesPage.pagination);
  } finally {
    await new Promise((res) => server.close(res));
    await disconnectDatabase();
    await mem.stop();
  }

  console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED ✓' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});