'use strict';

const mongoose = require('mongoose');

/*
 A record of every webhook delivery GitHub sends. Storing them gives
 an audit trail and allows reacting to changes (e.g. re-sync a repo when
 a push or issue event arrives) without polling.
 */
const webhookEventSchema = new mongoose.Schema(
  {
    deliveryId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true }, // X-GitHub-Event, e.g. "push"
    action: { type: String },

    repoFullName: { type: String, index: true },
    repo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Repository',
      index: true,
    },

    payloadSummary: { type: mongoose.Schema.Types.Mixed },

    processed: { type: Boolean, default: false },
    receivedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);