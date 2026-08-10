'use strict';

const express = require('express');
const { requireAuth, loadOwnedRepo } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const exportService = require('../services/exportService');

const router = express.Router({ mergeParams: true });

router.use(requireAuth, loadOwnedRepo);

/**
 * GET /api/repos/:id/export?format=json
 * GET /api/repos/:id/export?format=csv&section=contributors
 *
 * JSON returns a full report. CSV returns one flat table for a chosen
 * section (contributors | commit-activity | languages | stale-issues).
 * Both are sent as file downloads.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const format = (req.query.format || 'json').toLowerCase();
    const safeName = req.repo.fullName.replace('/', '-');

    if (format === 'json') {
      const report = await exportService.buildReport(req.repo._id);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeName}-report.json"`
      );
      return res.send(JSON.stringify(report, null, 2));
    }

    if (format === 'csv') {
      const section = req.query.section || 'contributors';
      const csv = await exportService.buildCsv(req.repo._id, section);
      if (csv === null) {
        throw new AppError(
          'Unknown CSV section. Use: contributors | commit-activity | languages | stale-issues',
          400
        );
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeName}-${section}.csv"`
      );
      return res.send(csv);
    }

    throw new AppError('Unsupported format. Use format=json or format=csv.', 400);
  })
);

module.exports = router;
