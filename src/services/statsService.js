'use strict';

const { config } = require('../config');
const Issue = require('../models/Issue');
const Commit = require('../models/Commit');
const Contributor = require('../models/Contributor');
const LanguageStat = require('../models/LanguageStat');
const CommitActivity = require('../models/CommitActivity');
const RepoSnapshot = require('../models/RepoSnapshot');

/**
 * Read-side service: turns the raw rows we've stored into the meaningful
 * statistics the dashboard displays. Most of the heavy lifting is done by
 * MongoDB aggregation pipelines so the database does the counting, not us.
 */

/** High-level overview: current counts plus how they've trended over time. */
async function getOverview(repoId) {
  // Group issues/PRs into open/closed counts in a single DB pass.
  const [counts] = await Issue.aggregate([
    { $match: { repo: repoId } },
    {
      $group: {
        _id: null,
        openIssues: {
          $sum: { $cond: [{ $and: [{ $eq: ['$isPullRequest', false] }, { $eq: ['$state', 'open'] }] }, 1, 0] },
        },
        closedIssues: {
          $sum: { $cond: [{ $and: [{ $eq: ['$isPullRequest', false] }, { $eq: ['$state', 'closed'] }] }, 1, 0] },
        },
        openPullRequests: {
          $sum: { $cond: [{ $and: [{ $eq: ['$isPullRequest', true] }, { $eq: ['$state', 'open'] }] }, 1, 0] },
        },
        closedPullRequests: {
          $sum: { $cond: [{ $and: [{ $eq: ['$isPullRequest', true] }, { $eq: ['$state', 'closed'] }] }, 1, 0] },
        },
      },
    },
  ]);

  const totalCommits = await Commit.countDocuments({ repo: repoId });
  const contributorsCount = await Contributor.countDocuments({ repo: repoId });

  // The historical trend: last 30 snapshots, oldest → newest.
  const snapshots = await RepoSnapshot.find({ repo: repoId })
    .sort({ capturedAt: -1 })
    .limit(30)
    .lean();
  snapshots.reverse();

  return {
    issues: {
      open: counts ? counts.openIssues : 0,
      closed: counts ? counts.closedIssues : 0,
    },
    pullRequests: {
      open: counts ? counts.openPullRequests : 0,
      closed: counts ? counts.closedPullRequests : 0,
    },
    totalCommits,
    contributorsCount,
    trend: snapshots.map((s) => ({
      capturedAt: s.capturedAt,
      openIssues: s.openIssues,
      closedIssues: s.closedIssues,
      openPullRequests: s.openPullRequests,
      closedPullRequests: s.closedPullRequests,
      totalCommits: s.totalCommits,
      contributorsCount: s.contributorsCount,
      stars: s.stars,
    })),
  };
}

/** Weekly commit activity series (oldest → newest). */
async function getCommitActivity(repoId) {
  const weeks = await CommitActivity.find({ repo: repoId })
    .sort({ weekStart: 1 })
    .lean();
  return weeks.map((w) => ({
    weekStart: w.weekStart,
    total: w.total,
    days: w.days,
  }));
}

/** Language breakdown with percentages. */
async function getLanguages(repoId) {
  const stat = await LanguageStat.findOne({ repo: repoId }).lean();
  if (!stat) return { totalBytes: 0, languages: [] };
  return { totalBytes: stat.totalBytes, languages: stat.languages, capturedAt: stat.capturedAt };
}

/** Most active contributors, ranked by commit count. */
async function getTopContributors(repoId, limit = 10) {
  return Contributor.find({ repo: repoId })
    .sort({ commits: -1 })
    .limit(limit)
    .lean();
}

/**
 * "Stale" / inactive issues: still open and not touched in `days` days.
 * We also compute how many days each one has been idle.
 */
async function getStaleIssues(repoId, days = config.sync.staleIssueDays) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const issues = await Issue.find({
    repo: repoId,
    isPullRequest: false,
    state: 'open',
    ghUpdatedAt: { $lt: cutoff },
  })
    .sort({ ghUpdatedAt: 1 })
    .lean();

  const now = Date.now();
  return {
    thresholdDays: days,
    count: issues.length,
    issues: issues.map((i) => ({
      number: i.number,
      title: i.title,
      authorLogin: i.authorLogin,
      labels: i.labels,
      ghUpdatedAt: i.ghUpdatedAt,
      htmlUrl: i.htmlUrl,
      idleDays: Math.floor((now - new Date(i.ghUpdatedAt).getTime()) / (24 * 60 * 60 * 1000)),
    })),
  };
}

/** Label distribution across issues/PRs (how many carry each label). */
async function getLabelDistribution(repoId) {
  return Issue.aggregate([
    { $match: { repo: repoId } },
    { $unwind: '$labels' },
    { $group: { _id: '$labels', count: { $sum: 1 } } },
    { $project: { _id: 0, label: '$_id', count: 1 } },
    { $sort: { count: -1 } },
  ]);
}

/** Paginated list of issues/PRs with optional filters. */
async function getIssues(repoId, { type, state, label, page = 1, limit = 20 } = {}) {
  const filter = { repo: repoId };
  if (type === 'issue') filter.isPullRequest = false;
  if (type === 'pr') filter.isPullRequest = true;
  if (state === 'open' || state === 'closed') filter.state = state;
  if (label) filter.labels = label;

  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    Issue.find(filter).sort({ ghUpdatedAt: -1 }).skip(skip).limit(limit).lean(),
    Issue.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

module.exports = {
  getOverview,
  getCommitActivity,
  getLanguages,
  getTopContributors,
  getStaleIssues,
  getLabelDistribution,
  getIssues,
};
