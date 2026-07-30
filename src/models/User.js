'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    githubId: { type: Number, required: true, unique: true, index: true },
    login: { type: String, required: true },
    name: { type: String },
    email: { type: String },
    avatarUrl: { type: String },
    htmlUrl: { type: String }, // link to their GitHub profile
    company: { type: String },
    location: { type: String },
    bio: { type: String },
    publicRepos: { type: Number, default: 0 },
    followers: { type: Number, default: 0 },
    following: { type: Number, default: 0 },

    accessToken: { type: String, select: false },
    scopes: { type: [String], default: [] },

    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);