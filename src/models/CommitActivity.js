'use strict';

const mongoose = require('mongoose');

/*
 'days' is a 7-element array [Sun..Sat] of commit counts, matching
 the shape GitHub's stats/commit_activity endpoint returns.
 */
const commitActivitySchema = new mongoose.Schema(
  {
    repo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
      index: true,
    },
    weekStart: { type: Date, required: true },
    total: { type: Number, default: 0 },
    days: { type: [Number], default: () => [0, 0, 0, 0, 0, 0, 0] },
  },
  { timestamps: true }
);

commitActivitySchema.index({ repo: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('CommitActivity', commitActivitySchema);