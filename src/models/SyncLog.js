'use strict';

const mongoose = require('mongoose');

// A log of each background sync run for a repository
const syncLogSchema = new mongoose.Schema(
  {
    repo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repository',
      required: true,
      index: true,
    },
    type: { type: String, default: 'full' }, // full | webhook | ...
    status: {
      type: String,
      enum: ['running', 'success', 'error'],
      default: 'running',
    },
    triggeredBy: { type: String, default: 'manual' }, // manual | scheduled | webhook
    itemsProcessed: { type: Number, default: 0 },
    error: { type: String },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SyncLog', syncLogSchema);