'use strict';

const { GitHubClient } = require('./githubClient');
const { decrypt } = require('../utils/crypto');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

const User = require('../models/User');
const Repository = require('../models/Repository');
const Commit = require('../models/Commit');
const Issue = require('../models/Issue');
const Contributor = require('../models/Contributor');
const LanguageStat = require('../models/LanguageStat');
const CommitActivity = require('../models/CommitActivity');
const RepoSnapshot = require('../models/RepoSnapshot');
const SyncLog = require('../models/SyncLog');

/*
 The "background processing" heart of AnaGit. A sync fetches the latest
 data for one repository from GitHub and writes it into the database so
  we can compute historical statistics from it later.
 
 Syncs are triggered:
   • when a repo is first added,
   • manually from the API,
   • on a schedule (node-cron), and
   • by incoming webhooks.
 
  The `syncStatus` field on the repository acts as a simple lock so two
  syncs of the same repo never run at once.
 */

// Build a GitHub client
async function clientForRepo(repo) {
  const owner = await User.findById(repo.addedBy).select('+accessToken');
  if (!owner || !owner.accessToken) {
    throw new AppError('The user who added this repo has no valid token; they need to sign in again.', 401);
  }
  return new GitHubClient(decrypt(owner.accessToken));
}

/*
 Run a full sync for one repository document.
 Returns the finished SyncLog (or null if it was skipped).
 */
async function syncRepository(repo, { triggeredBy = 'manual' } = {}) {
  // skip if this repo is already syncing.
  if (repo.syncStatus === 'syncing') {
    logger.info(`Sync skipped for ${repo.fullName} — already in progress`);
    return null;
  }

  repo.syncStatus = 'syncing';
  repo.syncError = null;
  await repo.save();

  const log = await SyncLog.create({
    repo: repo._id,
    type: 'full',
    status: 'running',
    triggeredBy,
    startedAt: new Date(),
  });

  let itemsProcessed = 0;

  try {
    const gh = await clientForRepo(repo);
    const fullName = repo.fullName;
    logger.info(`Syncing ${fullName} (triggered by ${triggeredBy})...`);

    // Repository metadata (stars, forks, default branch, etc)
    const repoData = await gh.getRepo(fullName);
    repo.description = repoData.description;
    repo.htmlUrl = repoData.html_url;
    repo.defaultBranch = repoData.default_branch;
    repo.isPrivate = repoData.private;
    repo.isFork = repoData.fork;
    repo.stars = repoData.stargazers_count;
    repo.forks = repoData.forks_count;
    repo.watchers = repoData.subscribers_count ?? repoData.watchers_count ?? 0;
    repo.openIssuesCount = repoData.open_issues_count;

    // Languages → compute percentages
    itemsProcessed += await syncLanguages(gh, repo);

    // Issues & pull requests
    itemsProcessed += await syncIssues(gh, repo);

    // Individual commits
    itemsProcessed += await syncCommits(gh, repo);

    // Weekly commit activity
    itemsProcessed += await syncCommitActivity(gh, repo);

    // Contributor statistics
    itemsProcessed += await syncContributors(gh, repo);

    // Historical snapshot of the key numbers
    await writeSnapshot(repo);

    repo.lastSyncedAt = new Date();
    repo.syncStatus = 'idle';
    await repo.save();

    log.status = 'success';
    log.itemsProcessed = itemsProcessed;
    log.finishedAt = new Date();
    await log.save();

    logger.info(`Synced ${fullName} — ${itemsProcessed} items processed`);
    return log;
  } catch (err) {
    repo.syncStatus = 'error';
    repo.syncError = err.message;
    await repo.save();

    log.status = 'error';
    log.error = err.message;
    log.itemsProcessed = itemsProcessed;
    log.finishedAt = new Date();
    await log.save();

    logger.error(`Sync failed for ${repo.fullName}: ${err.message}`);
    return log;
  }
}

async function syncLanguages(gh, repo) {
  const languages = await gh.getLanguages(repo.fullName);
  const entries = Object.entries(languages || {});
  const totalBytes = entries.reduce((sum, [, bytes]) => sum + bytes, 0);

  const breakdown = entries
    .map(([language, bytes]) => ({
      language,
      bytes,
      percentage: totalBytes ? Math.round((bytes / totalBytes) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  await LanguageStat.findOneAndUpdate(
    { repo: repo._id },
    { repo: repo._id, totalBytes, languages: breakdown, capturedAt: new Date() },
    { upsert: true }
  );

  return breakdown.length;
}

async function syncIssues(gh, repo) {
  const issues = await gh.getIssues(repo.fullName, { state: 'all' });

  const ops = issues.map((raw) => ({
    updateOne: {
      filter: { repo: repo._id, number: raw.number },
      update: {
        $set: {
          repo: repo._id,
          number: raw.number,
          title: raw.title,
          state: raw.state,
          isPullRequest: Boolean(raw.pull_request),
          authorLogin: raw.user ? raw.user.login : null,
          authorAvatar: raw.user ? raw.user.avatar_url : null,
          labels: (raw.labels || []).map((l) => (typeof l === 'string' ? l : l.name)),
          assignees: (raw.assignees || []).map((a) => a.login),
          comments: raw.comments,
          ghCreatedAt: raw.created_at,
          ghUpdatedAt: raw.updated_at,
          ghClosedAt: raw.closed_at,
          htmlUrl: raw.html_url,
        },
      },
      upsert: true,
    },
  }));

  if (ops.length) await Issue.bulkWrite(ops, { ordered: false });
  return issues.length;
}

async function syncCommits(gh, repo) {
  // Incremental: only fetch commits newer than our last sync. On the first
  // sync, look back one year so we don't try to download an entire history.
  const since = repo.lastSyncedAt
    ? repo.lastSyncedAt.toISOString()
    : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  const commits = await gh.getCommits(repo.fullName, { since });

  const ops = commits.map((raw) => ({
    updateOne: {
      filter: { repo: repo._id, sha: raw.sha },
      update: {
        $set: {
          repo: repo._id,
          sha: raw.sha,
          message: raw.commit ? raw.commit.message : '',
          authorName: raw.commit && raw.commit.author ? raw.commit.author.name : null,
          authorEmail: raw.commit && raw.commit.author ? raw.commit.author.email : null,
          authorLogin: raw.author ? raw.author.login : null,
          committedAt: raw.commit && raw.commit.author ? raw.commit.author.date : null,
        },
      },
      upsert: true,
    },
  }));

  if (ops.length) await Commit.bulkWrite(ops, { ordered: false });
  return commits.length;
}

async function syncCommitActivity(gh, repo) {
  const weeks = await gh.getWeeklyCommitActivity(repo.fullName);
  if (!Array.isArray(weeks) || weeks.length === 0) return 0;

  const ops = weeks.map((w) => ({
    updateOne: {
      filter: { repo: repo._id, weekStart: new Date(w.week * 1000) },
      update: {
        $set: {
          repo: repo._id,
          weekStart: new Date(w.week * 1000),
          total: w.total,
          days: w.days,
        },
      },
      upsert: true,
    },
  }));

  await CommitActivity.bulkWrite(ops, { ordered: false });
  return weeks.length;
}

async function syncContributors(gh, repo) {
  const stats = await gh.getContributorStats(repo.fullName);
  if (!Array.isArray(stats) || stats.length === 0) return 0;

  const ops = stats.map((c) => {
    // Sum additions/deletions across all weeks; find the last active week.
    let additions = 0;
    let deletions = 0;
    let lastActiveWeek = 0;
    for (const w of c.weeks || []) {
      additions += w.a || 0;
      deletions += w.d || 0;
      if ((w.c || 0) > 0 && w.w > lastActiveWeek) lastActiveWeek = w.w;
    }
    return {
      updateOne: {
        filter: { repo: repo._id, login: c.author ? c.author.login : 'unknown' },
        update: {
          $set: {
            repo: repo._id,
            login: c.author ? c.author.login : 'unknown',
            avatarUrl: c.author ? c.author.avatar_url : null,
            htmlUrl: c.author ? c.author.html_url : null,
            commits: c.total,
            additions,
            deletions,
            lastActiveAt: lastActiveWeek ? new Date(lastActiveWeek * 1000) : null,
          },
        },
        upsert: true,
      },
    };
  });

  await Contributor.bulkWrite(ops, { ordered: false });
  return stats.length;
}

// Compute current totals from DB and store one historical snapshot.
async function writeSnapshot(repo) {
  const [openIssues, closedIssues, openPRs, closedPRs, totalCommits, contributorsCount] =
    await Promise.all([
      Issue.countDocuments({ repo: repo._id, isPullRequest: false, state: 'open' }),
      Issue.countDocuments({ repo: repo._id, isPullRequest: false, state: 'closed' }),
      Issue.countDocuments({ repo: repo._id, isPullRequest: true, state: 'open' }),
      Issue.countDocuments({ repo: repo._id, isPullRequest: true, state: 'closed' }),
      Commit.countDocuments({ repo: repo._id }),
      Contributor.countDocuments({ repo: repo._id }),
    ]);

  await RepoSnapshot.create({
    repo: repo._id,
    capturedAt: new Date(),
    stars: repo.stars,
    forks: repo.forks,
    watchers: repo.watchers,
    openIssues,
    closedIssues,
    openPullRequests: openPRs,
    closedPullRequests: closedPRs,
    totalCommits,
    contributorsCount,
  });
}

//run a sync in the background without blocking the HTTP response.
function syncRepositoryInBackground(repo, opts) {
  setImmediate(() => {
    syncRepository(repo, opts).catch((err) =>
      logger.error(`Background sync error for ${repo.fullName}:`, err.message)
    );
  });
}

// Sync every repository we track.
async function syncAllRepositories({ triggeredBy = 'scheduled' } = {}) {
  const repos = await Repository.find({});
  logger.info(`Scheduled sync starting for ${repos.length} repositories`);
  for (const repo of repos) {
    await syncRepository(repo, { triggeredBy });
  }
  logger.info('Scheduled sync finished');
}

module.exports = {
  syncRepository,
  syncRepositoryInBackground,
  syncAllRepositories,
};
