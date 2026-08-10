'use strict';

const express = require('express');
const oauthService = require('../services/oauthService');
const { GitHubClient } = require('../services/githubClient');
const { encrypt } = require('../utils/crypto');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const User = require('../models/User');
const logger = require('../utils/logger');

const router = express.Router();

/*
 GET /api/auth/github
 Step 1 of OAuth: send the browser to GitHub to approve access.
 */
router.get('/github', (req, res) => {
  const state = oauthService.generateState();
  req.session.oauthState = state;
  res.redirect(oauthService.getAuthorizeUrl(state));
});

/*
 GET /api/auth/github/callback
 Step 2: GitHub redirects here with `code` and `state`
 */
router.get(
  '/github/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;

    // If user denies access on GitHub's screen.
    if (error) {
      throw new AppError(`GitHub authorization failed: ${errorDescription || error}`, 400);
    }
    // CSRF check: state must match what we issued.
    if (!state || state !== req.session.oauthState) {
      throw new AppError('Invalid OAuth state. Please try signing in again.', 400);
    }
    delete req.session.oauthState;

    if (!code) throw new AppError('Missing authorization code from GitHub.', 400);

    // Exchange code → access token, then fetch the real GitHub identity.
    const { accessToken, scopes } = await oauthService.exchangeCodeForToken(code);
    const gh = new GitHubClient(accessToken);
    const profile = await gh.getAuthenticatedUser();

    // Upsert the user, storing the ENCRYPTED token.
    const user = await User.findOneAndUpdate(
      { githubId: profile.id },
      {
        githubId: profile.id,
        login: profile.login,
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.avatar_url,
        htmlUrl: profile.html_url,
        company: profile.company,
        location: profile.location,
        bio: profile.bio,
        publicRepos: profile.public_repos,
        followers: profile.followers,
        following: profile.following,
        accessToken: encrypt(accessToken),
        scopes,
        lastLoginAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Log the user in by storing their id in the session.
    req.session.userId = user._id.toString();
    logger.info(`User signed in: ${user.login} (#${user.githubId})`);

    res.redirect('/');
  })
);

/*
 POST /api/auth/logout
 Destroys the session.
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) logger.error('Error destroying session:', err.message);
    res.clearCookie('anagit.sid');
    res.json({ message: 'Logged out' });
  });
});

module.exports = router;
