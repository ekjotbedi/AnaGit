'use strict';

const mongoose = require('mongoose');

/*
 Populated from GitHub's "contributor statistics" endpoint, which
 gives per-week commit / addition / deletion counts.
 */
const contributorSchema = new mongoose.Schema(
  {
    repo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
      index: true,
    },
    login: { type: String, required: true },
    avatarUrl: { type: String },
    htmlUrl: { type: String },

    commits: { type: Number, default: 0 },
    additions: { type: Number, default: 0 },
    deletions: { type: Number, default: 0 },
    lastActiveAt: { type: Date },
  },
  { timestamps: true }
);

contributorSchema.index({ repo: 1, login: 1 }, { unique: true });

module.exports = mongoose.model('Contributor', contributorSchema);