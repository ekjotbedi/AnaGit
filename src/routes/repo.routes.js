'use strict';

const express = require('express');
const { requireAuth, loadOwnedRepo } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { GitHubClient } = require('../services/githubClient');
const { decrypt } = require('../utils/crypto');
const {
  syncRepository,
  syncRepositoryInBackground,
} = require('../services/syncService');

const User = require('../models/User');
const Repository = require('../models/Repository');
const Commit = require('../models/Commit');
const Issue = require('../models/Issue');
const Contributor = require('../models/Contributor');
const LanguageStat = require('../models/LanguageStat');
const CommitActivity = require('../models/CommitActivity');
const RepoSnapshot = require('../models/RepoSnapshot');
const SyncLog = require('../models/SyncLog');

const router = express.Router();

// The user has to sign in to access the app
router.use(requireAuth);

/*
 GET /api/repos
 Lists the repositories the current user has added to AnaGit.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const repos = await Repository.find({ addedBy: req.user._id })
      .sort({ updatedAt: -1 })
      .lean();
    res.json(repos);
  })
);

/*
 POST /api/repos   body: { fullName: "owner/name" }
 Add a repository to analyze.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { fullName } = req.body || {};
    if (!fullName || !/^[^/\s]+\/[^/\s]+$/.test(fullName)) {
      throw new AppError('Provide a repository as "owner/name".', 400);
    }

    const existing = await Repository.findOne({ addedBy: req.user._id, fullName });
    if (existing) {
      throw new AppError('You have already added this repository.', 409);
    }

    // Confirm the repo exists and the user has access, using their token.
    const owner = await User.findById(req.user._id).select('+accessToken');
    const gh = new GitHubClient(decrypt(owner.accessToken));
    const repoData = await gh.getRepo(fullName); // throws 404 if no access

    const repo = await Repository.create({
      githubId: repoData.id,
      owner: repoData.owner.login,
      name: repoData.name,
      fullName: repoData.full_name,
      description: repoData.description,
      htmlUrl: repoData.html_url,
      defaultBranch: repoData.default_branch,
      isPrivate: repoData.private,
      isFork: repoData.fork,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      watchers: repoData.subscribers_count ?? repoData.watchers_count ?? 0,
      openIssuesCount: repoData.open_issues_count,
      addedBy: req.user._id,
      syncStatus: 'idle',
    });

    // Kick off the initial data pull without making the user wait.
    syncRepositoryInBackground(repo, { triggeredBy: 'initial-add' });

    res.status(201).json({
      message: 'Repository added. Initial sync started in the background.',
      repo,
    });
  })
);

/*
 GET /api/repos/:id
 Repository details as we currently have them stored.
 */
router.get(
  '/:id',
  loadOwnedRepo,
  asyncHandler(async (req, res) => {
    res.json(req.repo);
  })
);

/*
 POST /api/repos/:id/sync
 Trigger a re-sync. By default it runs in the background;
 */
router.post(
  '/:id/sync',
  loadOwnedRepo,
  asyncHandler(async (req, res) => {
    if (req.repo.syncStatus === 'syncing') {
      return res.status(409).json({ message: 'A sync is already in progress.' });
    }

    if (req.query.wait === 'true') {
      const log = await syncRepository(req.repo, { triggeredBy: 'manual' });
      return res.json({ message: 'Sync complete.', log });
    }

    syncRepositoryInBackground(req.repo, { triggeredBy: 'manual' });
    res.status(202).json({ message: 'Sync started in the background.' });
  })
);

/*
 GET /api/repos/:id/sync-logs
 Recent sync history for a repo.
 */
router.get(
  '/:id/sync-logs',
  loadOwnedRepo,
  asyncHandler(async (req, res) => {
    const logs = await SyncLog.find({ repo: req.repo._id })
      .sort({ startedAt: -1 })
      .limit(20)
      .lean();
    res.json(logs);
  })
);

/*
 DELETE /api/repos/:id
 Remove a repo and all of its analyzed data.
 */
router.delete(
  '/:id',
  loadOwnedRepo,
  asyncHandler(async (req, res) => {
    const repoId = req.repo._id;
    await Promise.all([
      Commit.deleteMany({ repo: repoId }),
      Issue.deleteMany({ repo: repoId }),
      Contributor.deleteMany({ repo: repoId }),
      LanguageStat.deleteMany({ repo: repoId }),
      CommitActivity.deleteMany({ repo: repoId }),
      RepoSnapshot.deleteMany({ repo: repoId }),
      SyncLog.deleteMany({ repo: repoId }),
    ]);
    await req.repo.deleteOne();
    res.json({ message: 'Repository and its data were removed.' });
  })
);

module.exports = router;
