'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Repository = require('../models/Repository');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/*
  Gatekeeper middleware: requires a logged-in session. If valid, it loads
  the user from the database and attaches it as req.user for later handlers.
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    throw new AppError('You must be signed in to access this resource.', 401);
  }
  const user = await User.findById(req.session.userId);
  if (!user) {
    // Session references a user that no longer exists — clear it.
    req.session.destroy(() => {});
    throw new AppError('Session is no longer valid. Please sign in again.', 401);
  }
  req.user = user;
  next();
});

/*
 Loads the repository referenced by :id and verifies if current user
 owns it, attached as req.repo.
 */
const loadOwnedRepo = asyncHandler(async (req, res, next) => {
  // A malformed id isn't a real repo — treat it as "not found" otherwise, Mongoose will throw a cast error
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new AppError('Repository not found.', 404);
  }
  const repo = await Repository.findById(req.params.id);
  if (!repo) {
    throw new AppError('Repository not found.', 404);
  }
  if (String(repo.addedBy) !== String(req.user._id)) {
    throw new AppError('Repository not found.', 404);
  }
  req.repo = repo;
  next();
});

module.exports = { requireAuth, loadOwnedRepo };
