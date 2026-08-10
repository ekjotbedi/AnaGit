'use strict';

const express = require('express');
const crypto = require('crypto');
const { config } = require('../config');
const logger = require('../utils/logger');
const asyncHandler = require('../utils/asyncHandler');
const Repository = require('../models/Repository');
const WebhookEvent = require('../models/WebhookEvent');
const { syncRepositoryInBackground } = require('../services/syncService');

const router = express.Router();

/**
 * Verify GitHub's HMAC signature (X-Hub-Signature-256) over the RAW
 * request body. This proves the request really came from GitHub and
 * wasn't forged. `req.body` here is a Buffer because this route is
 * mounted with express.raw() in app.js (JSON parsing would change the
 * bytes and break the signature).
 */
function verifySignature(req) {
  const signature = req.get('X-Hub-Signature-256');
  if (!signature) return false;

  const expected =
    'sha256=' +
    crypto
      .createHmac('sha256', config.github.webhookSecret)
      .update(req.body) // raw Buffer
      .digest('hex');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  // timingSafeEqual throws if lengths differ, so guard first.
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * POST /api/webhooks/github
 * Receives webhook deliveries from GitHub. We verify, record, and react.
 */
router.post(
  '/github',
  asyncHandler(async (req, res) => {
    if (!verifySignature(req)) {
      logger.warn('Rejected webhook with bad/missing signature');
      return res.status(401).json({ error: { message: 'Invalid signature' } });
    }

    const eventType = req.get('X-GitHub-Event');
    const deliveryId = req.get('X-GitHub-Delivery');
    const payload = JSON.parse(req.body.toString('utf8'));

    // GitHub sends a "ping" when you first create the webhook.
    if (eventType === 'ping') {
      return res.json({ message: 'pong' });
    }

    const repoFullName = payload.repository ? payload.repository.full_name : undefined;

    // Record the delivery (idempotent: duplicate deliveryId is ignored).
    try {
      await WebhookEvent.create({
        deliveryId,
        eventType,
        action: payload.action,
        repoFullName,
        payloadSummary: {
          action: payload.action,
          sender: payload.sender ? payload.sender.login : undefined,
          number: payload.issue ? payload.issue.number : payload.pull_request ? payload.pull_request.number : undefined,
          ref: payload.ref,
        },
      });
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate delivery — GitHub retried. Acknowledge and stop.
        return res.json({ message: 'Duplicate delivery ignored' });
      }
      throw err;
    }

    // React: if this event changes repo data and we track that repo,
    // trigger a background re-sync so our stats stay fresh.
    const actionable = ['push', 'issues', 'pull_request', 'issue_comment'];
    if (actionable.includes(eventType) && repoFullName) {
      const repos = await Repository.find({ fullName: repoFullName });
      for (const repo of repos) {
        syncRepositoryInBackground(repo, { triggeredBy: 'webhook' });
      }
      logger.info(`Webhook ${eventType} for ${repoFullName} → triggered ${repos.length} sync(s)`);
    }

    // Acknowledge quickly — GitHub expects a fast 2xx response.
    res.json({ message: 'Received' });
  })
);

module.exports = router;
