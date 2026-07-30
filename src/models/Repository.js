'use strict';

const mongoose = require('mongoose');

/*
 program keeps a copy of GitHub's metadata plus it's own
 bookkeeping fields like who added it, when last synced, sync state etc.
 */
const repositorySchema = new mongoose.Schema(
  {
    githubId: { type: Number, required: true, index: true },
    owner: { type: String, required: true },
    name: { type: String, required: true },
    fullName: { type: String, required: true, index: true },

    description: { type: String },
    htmlUrl: { type: String },
    defaultBranch: { type: String, default: 'main' },
    isPrivate: { type: Boolean, default: false },
    isFork: { type: Boolean, default: false },

    stars: { type: Number, default: 0 },
    forks: { type: Number, default: 0 },
    watchers: { type: Number, default: 0 },
    openIssuesCount: { type: Number, default: 0 },

    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    lastSyncedAt: { type: Date },
    syncStatus: {
      type: String,
      enum: ['idle', 'syncing', 'error'],
      default: 'idle',
    },
    syncError: { type: String },
  },
  { timestamps: true }
);

// A given user can only add a given repo once.
repositorySchema.index({ addedBy: 1, fullName: 1 }, { unique: true });

module.exports = mongoose.model('Repository', repositorySchema);