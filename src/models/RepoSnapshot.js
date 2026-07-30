'use strict';

const mongoose = require('mongoose');

/*
  we can chart how a repo has changed OVER TIME — the "store historical information and calculate
  meaningful statistics" requirement. A single  API call can't show trends but a growing table of snapshots can.
 */
const repoSnapshotSchema = new mongoose.Schema(
  {
    repo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
      index: true,
    },
    capturedAt: { type: Date, default: Date.now, index: true },

    stars: { type: Number, default: 0 },
    forks: { type: Number, default: 0 },
    watchers: { type: Number, default: 0 },

    openIssues: { type: Number, default: 0 },
    closedIssues: { type: Number, default: 0 },
    openPullRequests: { type: Number, default: 0 },
    closedPullRequests: { type: Number, default: 0 },

    totalCommits: { type: Number, default: 0 },
    contributorsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RepoSnapshot', repoSnapshotSchema);