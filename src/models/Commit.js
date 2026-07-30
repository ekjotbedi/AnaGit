'use strict';

const mongoose = require('mongoose');

// Stores the individual commits so statistics can be computed over time instead of relying on a single live API call.
const commitSchema = new mongoose.Schema(
  {
    repo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
      index: true,
    },
    sha: { type: String, required: true },
    message: { type: String },
    authorName: { type: String },
    authorEmail: { type: String },
    authorLogin: { type: String },
    committedAt: { type: Date, index: true },
  },
  { timestamps: true }
);

// same commit (sha) is stored once per repo.
commitSchema.index({ repo: 1, sha: 1 }, { unique: true });

module.exports = mongoose.model('Commit', commitSchema);