'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { GitHubClient } = require('../services/githubClient');
const { decrypt } = require('../utils/crypto');
const User = require('../models/User');

const router = express.Router();

/*
 GET /api/me
 Returns the currently signed-in user's profile.
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = req.user;
    res.json({
      id: u._id,
      githubId: u.githubId,
      login: u.login,
      name: u.name,
      avatarUrl: u.avatarUrl,
      htmlUrl: u.htmlUrl,
      company: u.company,
      location: u.location,
      bio: u.bio,
      publicRepos: u.publicRepos,
      followers: u.followers,
      following: u.following,
      scopes: u.scopes,
      lastLoginAt: u.lastLoginAt,
    });
  })
);

/*
 GET /api/me/github/repos
 Lists the repositories the signed-in user can access on GitHub, so the
 frontend can show a picker for "add a repo to analyze".
 */
router.get(
  '/github/repos',
  requireAuth,
  asyncHandler(async (req, res) => {
    const owner = await User.findById(req.user._id).select('+accessToken');
    const gh = new GitHubClient(decrypt(owner.accessToken));
    const repos = await gh.getUserRepos();

    // Return a trimmed shape
    res.json(
      repos.map((r) => ({
        githubId: r.id,
        fullName: r.full_name,
        name: r.name,
        owner: r.owner ? r.owner.login : null,
        description: r.description,
        private: r.private,
        fork: r.fork,
        stars: r.stargazers_count,
        forks: r.forks_count,
        language: r.language,
        updatedAt: r.updated_at,
        htmlUrl: r.html_url,
      }))
    );
  })
);

module.exports = router;
