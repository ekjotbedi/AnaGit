'use strict';

const express = require('express');
const { requireAuth, loadOwnedRepo } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const statsService = require('../services/statsService');

// mergeParams lets this router read :id from the path it's mounted under.
const router = express.Router({ mergeParams: true });

router.use(requireAuth, loadOwnedRepo);

// GET /api/repos/:id/overview — counts of issues/PRs/commits + trend.
router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    res.json(await statsService.getOverview(req.repo._id));
  })
);

// GET /api/repos/:id/commit-activity — weekly commit series.
router.get(
  '/commit-activity',
  asyncHandler(async (req, res) => {
    res.json(await statsService.getCommitActivity(req.repo._id));
  })
);

// GET /api/repos/:id/languages — language breakdown with percentages.
router.get(
  '/languages',
  asyncHandler(async (req, res) => {
    res.json(await statsService.getLanguages(req.repo._id));
  })
);

// GET /api/repos/:id/contributors?limit=10 — most active contributors.
router.get(
  '/contributors',
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    res.json(await statsService.getTopContributors(req.repo._id, limit));
  })
);

// GET /api/repos/:id/issues — paginated issues/PRs with filters.
router.get(
  '/issues',
  asyncHandler(async (req, res) => {
    const { type, state, label, page, limit } = req.query;
    res.json(
      await statsService.getIssues(req.repo._id, {
        type,
        state,
        label,
        page: parseInt(page, 10) || 1,
        limit: Math.min(parseInt(limit, 10) || 20, 100),
      })
    );
  })
);

// GET /api/repos/:id/stale-issues?days=30 — old/inactive open issues.
router.get(
  '/stale-issues',
  asyncHandler(async (req, res) => {
    const days = parseInt(req.query.days, 10) || undefined;
    res.json(await statsService.getStaleIssues(req.repo._id, days));
  })
);

// GET /api/repos/:id/labels — label distribution.
router.get(
  '/labels',
  asyncHandler(async (req, res) => {
    res.json(await statsService.getLabelDistribution(req.repo._id));
  })
);

module.exports = router;
