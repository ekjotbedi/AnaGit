'use strict';

const mongoose = require('mongoose');

//in GitHub's REST API every pull request is also an issue, so the /issues endpoint returns both

const issueSchema = new mongoose.Schema(
  {
    repo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
      index: true,
    },
    number: { type: Number, required: true },
    title: { type: String },
    state: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    isPullRequest: { type: Boolean, default: false, index: true },

    authorLogin: { type: String },
    authorAvatar: { type: String },
    labels: { type: [String], default: [] },
    assignees: { type: [String], default: [] },
    comments: { type: Number, default: 0 },

    ghCreatedAt: { type: Date },
    ghUpdatedAt: { type: Date, index: true },
    ghClosedAt: { type: Date },
    htmlUrl: { type: String },
  },
  { timestamps: true }
);

issueSchema.index({ repo: 1, number: 1 }, { unique: true });

module.exports = mongoose.model('Issue', issueSchema);